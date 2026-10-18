/**
 * Owner: Person B.
 *
 * The admin question bank: search/filter, create/replace (MCQ and CODING,
 * including the coding problem and its tests), metadata edits, duplicate,
 * delete, topics, tags, and bulk add to an exam.
 *
 * Content of a question used in a live exam is locked (QuestionLockService);
 * metadata never is.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  AuditEventType,
  BankQuestionDetail,
  BankQuestionPage,
  BulkAddToExamResult,
  CODE_MAX_LENGTH,
  CodeLanguage,
  OutputComparisonMode,
  QuestionStatus,
  QuestionType,
  TagCount,
  Topic,
} from '@secure-exam/types';
import {
  BankQuestionQueryDto,
  CreateTopicDto,
  SaveBankQuestionDto,
  UpdateBankQuestionMetaDto,
} from '@secure-exam/validation';
import { AuditService } from '../audit/audit.service';
import { CodingProblemEntity } from '../coding/entities/coding-problem.entity';
import { CodingTestCaseEntity } from '../coding/entities/coding-test-case.entity';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { OptionEntity } from '../question/entities/option.entity';
import { QuestionTagEntity } from '../question/entities/question-tag.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { TopicEntity } from '../question/entities/topic.entity';
import { isOptionType, validateOptionsForType } from '../question/option-rules';
import { QuestionLockService } from '../question/question-lock.service';
import { normalizeTags, toDetail, toSummary, toTopic } from './question-bank.mapper';

const DEFAULT_LIMIT = 20;
/** Postgres foreign_key_violation. */
const FK_VIOLATION = '23503';

@Injectable()
export class QuestionBankService {
  constructor(
    @InjectRepository(QuestionEntity) private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(TopicEntity) private readonly topicRepo: Repository<TopicEntity>,
    @InjectRepository(QuestionTagEntity) private readonly tagRepo: Repository<QuestionTagEntity>,
    @InjectRepository(ExamQuestionEntity) private readonly examQuestionRepo: Repository<ExamQuestionEntity>,
    @InjectRepository(CodingProblemEntity) private readonly problemRepo: Repository<CodingProblemEntity>,
    @InjectRepository(CodingTestCaseEntity) private readonly testCaseRepo: Repository<CodingTestCaseEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lockService: QuestionLockService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------

  async list(query: BankQuestionQueryDto): Promise<BankQuestionPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const qb = this.questionRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.topic', 'topic')
      .orderBy('q.createdAt', 'DESC')
      .addOrderBy('q.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search?.trim()) {
      qb.andWhere("q.text ILIKE :search ESCAPE '\\'", { search: `%${escapeLike(query.search.trim())}%` });
    }
    if (query.courseId) qb.andWhere('q.course_id = :courseId', { courseId: query.courseId });
    if (query.topicId) qb.andWhere('q.topic_id = :topicId', { topicId: query.topicId });
    if (query.difficulty) qb.andWhere('q.difficulty = :difficulty', { difficulty: query.difficulty });
    if (query.type) qb.andWhere('q.type = :type', { type: query.type });
    if (query.status) qb.andWhere('q.status = :status', { status: query.status });
    if (query.tag) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM question_tags t WHERE t.question_id = q.id AND t.tag = :tag)',
        { tag: normalizeTags([query.tag])[0] ?? '' },
      );
    }
    if (query.excludeExamId) {
      qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM exam_questions x WHERE x.question_id = q.id AND x.exam_id = :excludeExamId)',
        { excludeExamId: query.excludeExamId },
      );
    }

    const [questions, total] = await qb.getManyAndCount();
    const ids = questions.map((q) => q.id);
    const [tags, usage] = await Promise.all([this.tagsFor(ids), this.lockService.usage(ids)]);

    return {
      items: questions.map((q) => toSummary(q, tags.get(q.id) ?? [], usage.get(q.id))),
      total,
      page,
      limit,
    };
  }

  async get(id: string): Promise<BankQuestionDetail> {
    const question = await this.questionRepo.findOne({
      where: { id },
      relations: ['options', 'topic', 'tags'],
    });
    if (!question) throw new NotFoundException(`Question ${id} not found`);

    const [usage, problem, tests, liveExams] = await Promise.all([
      this.lockService.usage([id]),
      this.problemRepo.findOne({ where: { questionId: id } }),
      this.testCaseRepo.find({ where: { questionId: id }, order: { order: 'ASC' } }),
      this.lockService.liveExams(id),
    ]);
    return toDetail(
      question,
      question.tags.map((t) => t.tag),
      usage.get(id),
      problem,
      tests,
      liveExams,
    );
  }

  // ---------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------

  async create(
    dto: SaveBankQuestionDto,
    actorId: string,
    auditExtra: Record<string, unknown> = {},
  ): Promise<BankQuestionDetail> {
    await this.validateContent(dto);
    const id = await this.dataSource.transaction(async (manager) => {
      const question = await manager.getRepository(QuestionEntity).save(
        manager.getRepository(QuestionEntity).create({
          ...this.contentFields(dto),
          ...this.metaFields(dto),
          status: dto.status ?? QuestionStatus.READY,
        }),
      );
      await this.writeChildren(manager, question.id, dto);
      return question.id;
    });
    await this.auditService.logEvent(
      AuditEventType.QUESTION_CREATED,
      { questionId: id, type: dto.type, source: 'QUESTION_BANK', ...auditExtra },
      actorId,
    );
    return this.get(id);
  }

  /**
   * Replaces the whole question (content + metadata). For a question in a
   * started exam the type and the number of options must stay the same, and
   * options keep their ids (student answers point at them); the caller
   * should then recalculate those exams' results.
   */
  async replace(id: string, dto: SaveBankQuestionDto, actorId: string): Promise<BankQuestionDetail> {
    const existing = await this.questionRepo.findOne({ where: { id }, relations: ['options'] });
    if (!existing) throw new NotFoundException(`Question ${id} not found`);
    await this.validateContent(dto);
    const locked = await this.lockService.isLocked(id);
    if (locked) {
      if (dto.type !== existing.type) {
        throw new ConflictException("Students have answered this question, so its type can't change. Duplicate it instead.");
      }
      if (isOptionType(dto.type) && (dto.options ?? []).length !== (existing.options ?? []).length) {
        throw new ConflictException(
          "Students have answered this question, so options can't be added or removed. Edit their text or correct answers, or duplicate the question.",
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(QuestionEntity).update(
        { id },
        {
          ...this.contentFields(dto),
          ...this.metaFields(dto),
          status: dto.status ?? existing.status,
        },
      );
      await this.writeChildren(manager, id, dto, locked ? existing.options : undefined);
    });
    await this.auditService.logEvent(
      AuditEventType.QUESTION_UPDATED,
      { questionId: id, action: locked ? 'EDITED_AFTER_EXAM_STARTED' : 'REPLACED', type: dto.type, changes: dto },
      actorId,
    );
    return this.get(id);
  }

  /** Course / topic / difficulty / status / tags. Allowed even when locked. */
  async updateMeta(id: string, dto: UpdateBankQuestionMetaDto, actorId: string): Promise<BankQuestionDetail> {
    const existing = await this.questionRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`Question ${id} not found`);
    await this.validateTopic(
      dto.topicId === undefined ? existing.topicId : dto.topicId,
      dto.courseId === undefined ? existing.courseId : dto.courseId,
    );

    await this.dataSource.transaction(async (manager) => {
      const patch: Partial<QuestionEntity> = {};
      if (dto.courseId !== undefined) patch.courseId = dto.courseId;
      if (dto.topicId !== undefined) patch.topicId = dto.topicId;
      if (dto.difficulty !== undefined) patch.difficulty = dto.difficulty;
      if (dto.status !== undefined) patch.status = dto.status;
      if (Object.keys(patch).length > 0) {
        await manager.getRepository(QuestionEntity).update({ id }, patch);
      }
      if (dto.tags !== undefined) await this.replaceTags(manager, id, dto.tags);
    });
    await this.auditService.logEvent(
      AuditEventType.QUESTION_UPDATED,
      { questionId: id, action: 'META_UPDATED', changes: dto },
      actorId,
    );
    return this.get(id);
  }

  /** Copy as a new DRAFT question (content, metadata, coding problem, tests). */
  async duplicate(id: string, actorId: string): Promise<BankQuestionDetail> {
    const source = await this.get(id);
    const copy: SaveBankQuestionDto = {
      text: `${source.text} (copy)`.slice(0, 5000),
      type: source.type,
      marks: source.marks,
      negativeMarks: source.negativeMarks,
      explanation: source.explanation,
      courseId: source.courseId,
      topicId: source.topicId,
      difficulty: source.difficulty,
      status: QuestionStatus.DRAFT,
      tags: source.tags,
      options: source.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })),
      coding: source.coding
        ? {
            statementMd: source.coding.statementMd,
            starterCode: source.coding.starterCode,
            timeLimitMs: source.coding.timeLimitMs,
            memoryLimitMb: source.coding.memoryLimitMb,
            comparisonMode: source.coding.comparisonMode,
            referenceSolution: source.coding.referenceSolution ?? null,
            tests: source.coding.tests.map((t) => ({
              input: t.input,
              expectedOutput: t.expectedOutput,
              isSample: t.isSample,
              weight: t.weight,
            })),
          }
        : undefined,
    };
    return this.create(copy, actorId, { duplicatedFrom: id });
  }

  /** Only questions in no exam; answers keep the row alive otherwise (FK RESTRICT). */
  async remove(id: string, actorId: string): Promise<void> {
    const question = await this.questionRepo.findOne({ where: { id } });
    if (!question) throw new NotFoundException(`Question ${id} not found`);
    if (await this.examQuestionRepo.exist({ where: { questionId: id } })) {
      throw new ConflictException(
        'This question is attached to one or more exams. Remove it from those exams first, or archive it.',
      );
    }
    try {
      await this.questionRepo.delete({ id });
    } catch (err) {
      if ((err as { code?: string }).code === FK_VIOLATION) {
        throw new ConflictException('This question has student answers, so it can only be archived.');
      }
      throw err;
    }
    await this.auditService.logEvent(AuditEventType.QUESTION_DELETED, { questionId: id }, actorId);
  }

  // ---------------------------------------------------------------------
  // Exam composition
  // ---------------------------------------------------------------------

  /** Appends READY questions to an exam in the given order, skipping the rest with a reason. */
  async bulkAddToExam(examId: string, questionIds: string[], actorId: string): Promise<BulkAddToExamResult> {
    await this.lockService.assertExamComposable(examId);

    const uniqueIds = [...new Set(questionIds)];
    const [questions, existing, problems] = await Promise.all([
      this.questionRepo.find({ where: { id: In(uniqueIds) } }),
      this.examQuestionRepo.find({ where: { examId } }),
      this.problemRepo.find({ where: { questionId: In(uniqueIds) }, select: ['questionId'] }),
    ]);
    const byId = new Map(questions.map((q) => [q.id, q]));
    const inExam = new Set(existing.map((e) => e.questionId));
    const hasProblem = new Set(problems.map((p) => p.questionId));

    const result: BulkAddToExamResult = { added: [], skipped: [] };
    const toAdd: string[] = [];
    for (const qid of uniqueIds) {
      const q = byId.get(qid);
      if (!q) result.skipped.push({ questionId: qid, reason: 'Question not found' });
      else if (inExam.has(qid)) result.skipped.push({ questionId: qid, reason: 'Already in this exam' });
      else if (q.status !== QuestionStatus.READY)
        result.skipped.push({ questionId: qid, reason: `Only READY questions can be added (this one is ${q.status})` });
      else if (q.type === QuestionType.CODING && !hasProblem.has(qid))
        result.skipped.push({ questionId: qid, reason: 'Coding problem is not set up' });
      else toAdd.push(qid);
    }

    if (toAdd.length > 0) {
      const start = existing.length === 0 ? 0 : Math.max(...existing.map((e) => e.order)) + 1;
      await this.examQuestionRepo.insert(
        toAdd.map((questionId, i) => ({ examId, questionId, order: start + i })),
      );
      result.added = toAdd;
      await this.auditService.logEvent(
        AuditEventType.QUESTION_UPDATED,
        { examId, questionIds: toAdd, action: 'BULK_ADDED_TO_EXAM' },
        actorId,
      );
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // Topics and tags
  // ---------------------------------------------------------------------

  async listTopics(courseId?: string): Promise<Topic[]> {
    const topics = await this.topicRepo.find({
      where: courseId ? { courseId } : {},
      order: { name: 'ASC' },
    });
    return topics.map(toTopic);
  }

  async createTopic(dto: CreateTopicDto): Promise<Topic> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Topic name is required');
    const courseId = dto.courseId ?? null;
    // UNIQUE(course_id, name) doesn't catch duplicates when course_id is NULL.
    const clash = await this.topicRepo
      .createQueryBuilder('t')
      .where('LOWER(t.name) = LOWER(:name)', { name })
      .andWhere(courseId ? 't.course_id = :courseId' : 't.course_id IS NULL', { courseId })
      .getOne();
    if (clash) throw new ConflictException(`Topic "${clash.name}" already exists`);
    return toTopic(await this.topicRepo.save(this.topicRepo.create({ name, courseId })));
  }

  /** Questions keep existing; their topic is cleared (FK ON DELETE SET NULL). */
  async deleteTopic(id: string): Promise<void> {
    const res = await this.topicRepo.delete({ id });
    if (!res.affected) throw new NotFoundException(`Topic ${id} not found`);
  }

  async listTags(search?: string): Promise<TagCount[]> {
    const qb = this.tagRepo
      .createQueryBuilder('t')
      .select('t.tag', 'tag')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.tag')
      .orderBy('count', 'DESC')
      .addOrderBy('t.tag', 'ASC')
      .limit(50);
    if (search?.trim()) {
      qb.where("t.tag ILIKE :s ESCAPE '\\'", { s: `${escapeLike(search.trim().toLowerCase())}%` });
    }
    const rows: Array<{ tag: string; count: string }> = await qb.getRawMany();
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /** Shape rules per type, plus topic/course consistency. Throws 400. */
  async validateContent(dto: SaveBankQuestionDto): Promise<void> {
    if (dto.type === QuestionType.CODING) {
      if (dto.options && dto.options.length > 0) {
        throw new BadRequestException('A coding question has no options');
      }
      if (!dto.coding) throw new BadRequestException('A coding question needs a coding problem');
      for (const [lang, code] of Object.entries(dto.coding.starterCode ?? {})) {
        if (!Object.values(CodeLanguage).includes(lang as CodeLanguage)) {
          throw new BadRequestException(`Unsupported starter code language: ${lang}`);
        }
        if (typeof code !== 'string' || code.length > CODE_MAX_LENGTH) {
          throw new BadRequestException(`Starter code must be text up to ${CODE_MAX_LENGTH} characters`);
        }
      }
    } else if (isOptionType(dto.type)) {
      if (dto.coding) throw new BadRequestException('Only coding questions have a coding problem');
      validateOptionsForType(dto.type, dto.options);
    } else {
      throw new BadRequestException(`Unknown question type: ${dto.type}`);
    }
    await this.validateTopic(dto.topicId ?? null, dto.courseId ?? null);
  }

  private async validateTopic(topicId: string | null | undefined, courseId: string | null | undefined) {
    if (!topicId) return;
    const topic = await this.topicRepo.findOne({ where: { id: topicId } });
    if (!topic) throw new BadRequestException('Topic not found');
    if (topic.courseId && courseId && topic.courseId !== courseId) {
      throw new BadRequestException("The topic belongs to a different course than the question");
    }
  }

  private contentFields(dto: SaveBankQuestionDto): Partial<QuestionEntity> {
    return {
      text: dto.text.trim(),
      type: dto.type,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? null,
      explanation: dto.explanation ?? null,
    };
  }

  private metaFields(dto: SaveBankQuestionDto): Partial<QuestionEntity> {
    return {
      courseId: dto.courseId ?? null,
      topicId: dto.topicId ?? null,
      difficulty: dto.difficulty ?? null,
    };
  }

  /**
   * Replaces options, coding problem + tests, and tags to match `dto`.
   * With `keepOptions` (question already answered), options are updated in
   * place by position so their ids — which student answers reference — survive.
   */
  private async writeChildren(
    manager: EntityManager,
    questionId: string,
    dto: SaveBankQuestionDto,
    keepOptions?: OptionEntity[],
  ) {
    const optionRepo = manager.getRepository(OptionEntity);
    const problemRepo = manager.getRepository(CodingProblemEntity);
    const testRepo = manager.getRepository(CodingTestCaseEntity);

    if (keepOptions && isOptionType(dto.type)) {
      const existing = [...keepOptions].sort((a, b) => a.order - b.order);
      for (const [i, o] of (dto.options ?? []).entries()) {
        await optionRepo.update({ id: existing[i].id }, { text: o.text.trim(), isCorrect: o.isCorrect, order: i });
      }
      await this.replaceTags(manager, questionId, dto.tags ?? []);
      return;
    }

    await optionRepo.delete({ questionId });

    if (dto.type === QuestionType.CODING && dto.coding) {
      const c = dto.coding;
      const previous = await problemRepo.findOne({ where: { questionId } });
      const existingTests = await testRepo.find({ where: { questionId }, order: { order: 'ASC' } });
      const problem = problemRepo.create({
        questionId,
        statementMd: c.statementMd,
        starterCode: c.starterCode ?? {},
        allowedLanguages: [CodeLanguage.PYTHON],
        timeLimitMs: c.timeLimitMs ?? 2000,
        memoryLimitMb: c.memoryLimitMb ?? 256,
        comparisonMode: c.comparisonMode ?? OutputComparisonMode.TRIM,
        referenceSolution: c.referenceSolution ?? null,
      });
      await problemRepo.save(problem);

      // Keep test ids when nothing that decides a verdict changed (inputs,
      // expected outputs, comparison, limits): recalculation can then rescale
      // stored results to new marks/weights instead of rerunning everyone.
      const sameVerdicts =
        !!previous &&
        previous.comparisonMode === problem.comparisonMode &&
        previous.timeLimitMs === problem.timeLimitMs &&
        previous.memoryLimitMb === problem.memoryLimitMb &&
        existingTests.length === c.tests.length &&
        existingTests.every((t, i) => t.input === c.tests[i].input && t.expectedOutput === c.tests[i].expectedOutput);
      if (sameVerdicts) {
        for (const [i, t] of c.tests.entries()) {
          await testRepo.update({ id: existingTests[i].id }, { isSample: t.isSample, weight: t.weight ?? 1, order: i });
        }
      } else {
        await testRepo.delete({ questionId });
        await testRepo.insert(
          c.tests.map((t, i) => ({
            questionId,
            input: t.input,
            expectedOutput: t.expectedOutput,
            isSample: t.isSample,
            weight: t.weight ?? 1,
            order: i,
          })),
        );
      }
    } else {
      await testRepo.delete({ questionId });
      await problemRepo.delete({ questionId });
      await optionRepo.insert(
        (dto.options ?? []).map((o, i) => ({
          questionId,
          text: o.text.trim(),
          isCorrect: o.isCorrect,
          order: o.order ?? i,
        })),
      );
    }
    await this.replaceTags(manager, questionId, dto.tags ?? []);
  }

  private async replaceTags(manager: EntityManager, questionId: string, tags: string[]) {
    const repo = manager.getRepository(QuestionTagEntity);
    await repo.delete({ questionId });
    const normalized = normalizeTags(tags);
    if (normalized.length > 0) {
      await repo.insert(normalized.map((tag) => ({ questionId, tag })));
    }
  }

  private async tagsFor(questionIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (questionIds.length === 0) return map;
    const rows = await this.tagRepo.find({ where: { questionId: In(questionIds) }, order: { tag: 'ASC' } });
    for (const r of rows) map.set(r.questionId, [...(map.get(r.questionId) ?? []), r.tag]);
    return map;
  }
}

/** Escapes LIKE wildcards so a search for "50%" means the literal text. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

