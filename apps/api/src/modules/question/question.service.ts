import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AuditEventType,
  BulkImportResult,
  BulkImportRowError,
  QuestionType,
} from '@secure-exam/types';
import { AuditService } from '../audit/audit.service';
import { ExamEntity } from '../exam/entities/exam.entity';
import { QuestionEntity } from './entities/question.entity';
import { OptionEntity } from './entities/option.entity';
import { ExamQuestionEntity } from './entities/exam-question.entity';
import {
  AddQuestionToExamDto,
  CreateOptionDto,
  CreateQuestionDto,
  ReorderExamQuestionsDto,
  UpdateQuestionDto,
} from './dto';

@Injectable()
export class QuestionService {
  constructor(
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(OptionEntity)
    private readonly optionRepo: Repository<OptionEntity>,
    @InjectRepository(ExamQuestionEntity)
    private readonly examQuestionRepo: Repository<ExamQuestionEntity>,
    @InjectRepository(ExamEntity)
    private readonly examRepo: Repository<ExamEntity>,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // Question CRUD
  // ---------------------------------------------------------------------

  async create(dto: CreateQuestionDto, actorId: string): Promise<QuestionEntity> {
    this.validateOptionsForType(dto.type as unknown as QuestionType, dto.options);

    const question = this.questionRepo.create({
      text: dto.text,
      type: dto.type as unknown as QuestionType,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks,
      explanation: dto.explanation,
      options: dto.options.map((o) => this.optionRepo.create(o)),
    });
    const saved = await this.questionRepo.save(question);

    await this.auditService.logEvent(
      AuditEventType.QUESTION_CREATED,
      { questionId: saved.id },
      actorId,
    );
    return saved;
  }

  findAll(): Promise<QuestionEntity[]> {
    return this.questionRepo.find({ relations: ['options'], order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<QuestionEntity> {
    const question = await this.questionRepo.findOne({ where: { id }, relations: ['options'] });
    if (!question) throw new NotFoundException(`Question ${id} not found`);
    return question;
  }

  async update(id: string, dto: UpdateQuestionDto, actorId: string): Promise<QuestionEntity> {
    const question = await this.findOne(id);
    Object.assign(question, {
      text: dto.text ?? question.text,
      type: (dto.type as unknown as QuestionType) ?? question.type,
      marks: dto.marks ?? question.marks,
      negativeMarks: dto.negativeMarks ?? question.negativeMarks,
      explanation: dto.explanation ?? question.explanation,
    });
    const saved = await this.questionRepo.save(question);
    await this.auditService.logEvent(
      AuditEventType.QUESTION_UPDATED,
      { questionId: id, changes: dto },
      actorId,
    );
    return saved;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const question = await this.findOne(id);

    const usedInExam = await this.examQuestionRepo.findOne({ where: { questionId: id } });
    if (usedInExam) {
      throw new ConflictException(
        'Cannot delete a question that is still attached to one or more exams. Remove it from those exams first.',
      );
    }

    await this.questionRepo.remove(question);
    await this.auditService.logEvent(AuditEventType.QUESTION_DELETED, { questionId: id }, actorId);
  }

  // ---------------------------------------------------------------------
  // Options
  // ---------------------------------------------------------------------

  async addOption(questionId: string, dto: CreateOptionDto): Promise<OptionEntity> {
    const question = await this.findOne(questionId);
    const option = this.optionRepo.create({ ...dto, questionId: question.id });
    return this.optionRepo.save(option);
  }

  async updateOption(
    questionId: string,
    optionId: string,
    dto: Partial<CreateOptionDto>,
  ): Promise<OptionEntity> {
    const option = await this.optionRepo.findOne({ where: { id: optionId, questionId } });
    if (!option) throw new NotFoundException('Option not found for this question');
    Object.assign(option, dto);
    return this.optionRepo.save(option);
  }

  async deleteOption(questionId: string, optionId: string): Promise<void> {
    const option = await this.optionRepo.findOne({ where: { id: optionId, questionId } });
    if (!option) throw new NotFoundException('Option not found for this question');
    await this.optionRepo.remove(option);
  }

  /**
   * Enforced per rules:
   *  - MCQ_SINGLE: exactly one correct option
   *  - MCQ_MULTI: at least one correct option
   *  - TRUE_FALSE: exactly two options, exactly one correct
   */
  private validateOptionsForType(type: QuestionType, options: CreateOptionDto[]) {
    if (!options || options.length < 2) {
      throw new BadRequestException('A question needs at least two options');
    }
    const correctCount = options.filter((o) => o.isCorrect).length;

    switch (type) {
      case QuestionType.MCQ_SINGLE:
        if (correctCount !== 1) {
          throw new BadRequestException('MCQ_SINGLE requires exactly one correct option');
        }
        break;
      case QuestionType.MCQ_MULTI:
        if (correctCount < 1) {
          throw new BadRequestException('MCQ_MULTI requires at least one correct option');
        }
        break;
      case QuestionType.TRUE_FALSE:
        if (options.length !== 2 || correctCount !== 1) {
          throw new BadRequestException('TRUE_FALSE requires exactly two options, one correct');
        }
        break;
      default:
        throw new BadRequestException(`Unknown question type: ${type}`);
    }
  }

  // ---------------------------------------------------------------------
  // Exam <-> Question mapping
  // ---------------------------------------------------------------------

  private async assertExamExists(examId: string): Promise<ExamEntity> {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException(`Exam ${examId} not found`);
    return exam;
  }

  async getExamQuestions(examId: string): Promise<QuestionEntity[]> {
    await this.assertExamExists(examId);
    const mappings = await this.examQuestionRepo.find({
      where: { examId },
      order: { order: 'ASC' },
    });
    if (mappings.length === 0) return [];

    const questions = await this.questionRepo.find({
      where: { id: In(mappings.map((m) => m.questionId)) },
      relations: ['options'],
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    return mappings.map((m) => byId.get(m.questionId)).filter(Boolean) as QuestionEntity[];
  }

  async addQuestionToExam(
    examId: string,
    dto: AddQuestionToExamDto,
    actorId: string,
  ): Promise<ExamQuestionEntity> {
    await this.assertExamExists(examId);
    await this.findOne(dto.questionId); // 404 if question missing

    const existing = await this.examQuestionRepo.findOne({
      where: { examId, questionId: dto.questionId },
    });
    if (existing) throw new ConflictException('Question is already part of this exam');

    const order = dto.order ?? (await this.examQuestionRepo.count({ where: { examId } }));
    const mapping = this.examQuestionRepo.create({ examId, questionId: dto.questionId, order });
    const saved = await this.examQuestionRepo.save(mapping);

    await this.auditService.logEvent(
      AuditEventType.QUESTION_UPDATED,
      { examId, questionId: dto.questionId, action: 'ADDED_TO_EXAM' },
      actorId,
    );
    return saved;
  }

  async removeQuestionFromExam(examId: string, questionId: string, actorId: string): Promise<void> {
    const mapping = await this.examQuestionRepo.findOne({ where: { examId, questionId } });
    if (!mapping) throw new NotFoundException('Question is not part of this exam');
    await this.examQuestionRepo.remove(mapping);

    await this.auditService.logEvent(
      AuditEventType.QUESTION_UPDATED,
      { examId, questionId, action: 'REMOVED_FROM_EXAM' },
      actorId,
    );
  }

  async reorder(
    examId: string,
    dto: ReorderExamQuestionsDto,
  ): Promise<ExamQuestionEntity[]> {
    await this.assertExamExists(examId);
    const mappings = await this.examQuestionRepo.find({ where: { examId } });
    const byId = new Map(mappings.map((m) => [m.id, m]));

    if (dto.orderedExamQuestionIds.length !== mappings.length) {
      throw new BadRequestException(
        'orderedExamQuestionIds must include every question currently on this exam, exactly once',
      );
    }

    const updated: ExamQuestionEntity[] = [];
    for (let i = 0; i < dto.orderedExamQuestionIds.length; i++) {
      const mapping = byId.get(dto.orderedExamQuestionIds[i]);
      if (!mapping) {
        throw new BadRequestException(`ExamQuestion id ${dto.orderedExamQuestionIds[i]} not found on this exam`);
      }
      mapping.order = i;
      updated.push(mapping);
    }
    return this.examQuestionRepo.save(updated);
  }

  // ---------------------------------------------------------------------
  // Bulk import
  // ---------------------------------------------------------------------

  async bulkImport(
    csvContent: string,
    actorId: string,
  ): Promise<BulkImportResult> {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      throw new BadRequestException('CSV must have a header row and at least one data row');
    }

    const [, ...dataLines] = lines;
    const errors: BulkImportRowError[] = [];
    const toInsert: QuestionEntity[] = [];

    dataLines.forEach((line, idx) => {
      const rowNumber = idx + 2;
      try {
        const cells = this.parseCsvLine(line);
        const [text, type, marksStr, negativeMarksStr, ...optionCells] = cells;

        if (!text) throw new Error('text is required');
        if (!Object.values(QuestionType).includes(type as QuestionType)) {
          throw new Error(`invalid type "${type}"`);
        }
        const marks = Number(marksStr);
        if (Number.isNaN(marks) || marks < 0) throw new Error('marks must be a non-negative number');
        const negativeMarks = negativeMarksStr ? Number(negativeMarksStr) : undefined;

        const options: CreateOptionDto[] = [];
        for (let i = 0; i < optionCells.length; i += 2) {
          const optText = optionCells[i];
          const optCorrect = optionCells[i + 1];
          if (!optText) continue;
          options.push({
            text: optText,
            isCorrect: String(optCorrect).toLowerCase() === 'true',
            order: options.length,
          });
        }

        this.validateOptionsForType(type as QuestionType, options);

        toInsert.push(
          this.questionRepo.create({
            text,
            type: type as QuestionType,
            marks,
            negativeMarks,
            options: options.map((o) => this.optionRepo.create(o)),
          }),
        );
      } catch (err) {
        errors.push({ row: rowNumber, message: (err as Error).message });
      }
    });

    let createdCount = 0;
    if (toInsert.length > 0) {
      const saved = await this.questionRepo.save(toInsert);
      createdCount = saved.length;
      await this.auditService.logEvent(
        AuditEventType.QUESTIONS_BULK_IMPORTED,
        { createdCount, errorCount: errors.length },
        actorId,
      );
    }

    return { createdCount, errors };
  }

  private parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  }
}
