/**
 * Owner: Person B.
 *
 * Header-based CSV import into the bank (MCQ / TRUE_FALSE only; coding
 * questions need test cases, so they're created in the editor).
 *
 *   text,type,marks,negative_marks,explanation,difficulty,topic,tags,status,course_id,option1,...,option10,correct
 *
 * - Required: text, type, marks. Column order doesn't matter; names are case-insensitive.
 * - tags: separated by ";" or "|". topic: a name, created if it doesn't exist.
 * - correct: option numbers separated by ";" (e.g. "2" or "1;3"). TRUE_FALSE
 *   rows may leave the options empty (True/False) and use correct = true/false.
 * Every valid row is created in one transaction; invalid rows are reported
 * by line number and skipped.
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  AuditEventType,
  BulkImportResult,
  BulkImportRowError,
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
} from '@secure-exam/types';
import { BANK_LIMITS } from '@secure-exam/validation';
import { AuditService } from '../audit/audit.service';
import { OptionEntity } from '../question/entities/option.entity';
import { QuestionTagEntity } from '../question/entities/question-tag.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { TopicEntity } from '../question/entities/topic.entity';
import { validateOptionsForType } from '../question/option-rules';
import { parseCsv } from './csv';
import { normalizeTags } from './question-bank.mapper';

const MAX_ROWS = 1000;
const MAX_OPTIONS = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMPORTABLE_TYPES = [QuestionType.MCQ_SINGLE, QuestionType.MCQ_MULTI, QuestionType.TRUE_FALSE];

export interface ParsedImportRow {
  line: number;
  text: string;
  type: QuestionType;
  marks: number;
  negativeMarks: number | null;
  explanation: string | null;
  difficulty: QuestionDifficulty | null;
  topicName: string | null;
  courseId: string | null;
  status: QuestionStatus;
  tags: string[];
  options: { text: string; isCorrect: boolean; order: number }[];
}

@Injectable()
export class QuestionBankImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async importCsv(content: string, actorId: string): Promise<BulkImportResult> {
    const { rows, errors } = parseImportCsv(content);

    let createdCount = 0;
    if (rows.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        const topicIds = new Map<string, string>();
        for (const row of rows) {
          const topicId = row.topicName ? await this.topicId(manager, row, topicIds) : null;
          const question = await manager.getRepository(QuestionEntity).save(
            manager.getRepository(QuestionEntity).create({
              text: row.text,
              type: row.type,
              marks: row.marks,
              negativeMarks: row.negativeMarks,
              explanation: row.explanation,
              difficulty: row.difficulty,
              courseId: row.courseId,
              topicId,
              status: row.status,
            }),
          );
          await manager
            .getRepository(OptionEntity)
            .insert(row.options.map((o) => ({ ...o, questionId: question.id })));
          if (row.tags.length > 0) {
            await manager
              .getRepository(QuestionTagEntity)
              .insert(row.tags.map((tag) => ({ questionId: question.id, tag })));
          }
          createdCount++;
        }
      });
      await this.auditService.logEvent(
        AuditEventType.QUESTIONS_BULK_IMPORTED,
        { createdCount, errorCount: errors.length, source: 'QUESTION_BANK' },
        actorId,
      );
    }
    return { createdCount, errors };
  }

  /** Finds a topic by name (case-insensitive, same course) or creates it. */
  private async topicId(manager: EntityManager, row: ParsedImportRow, cache: Map<string, string>) {
    const key = `${row.courseId ?? ''}|${row.topicName!.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const repo = manager.getRepository(TopicEntity);
    const existing = await repo
      .createQueryBuilder('t')
      .where('LOWER(t.name) = LOWER(:name)', { name: row.topicName })
      .andWhere(row.courseId ? 't.course_id = :courseId' : 't.course_id IS NULL', { courseId: row.courseId })
      .getOne();
    const id = existing?.id ?? (await repo.save(repo.create({ name: row.topicName!, courseId: row.courseId }))).id;
    cache.set(key, id);
    return id;
  }
}

/** Pure parsing + validation, separated for testing. */
export function parseImportCsv(content: string): { rows: ParsedImportRow[]; errors: BulkImportRowError[] } {
  const table = parseCsv(content);
  if (table.length < 2) {
    throw new BadRequestException('CSV must have a header row and at least one data row');
  }
  if (table.length - 1 > MAX_ROWS) {
    throw new BadRequestException(`At most ${MAX_ROWS} questions per import`);
  }

  const header = table[0].map((h) => h.trim().toLowerCase());
  for (const required of ['text', 'type', 'marks']) {
    if (!header.includes(required)) {
      throw new BadRequestException(`Missing required column "${required}"`);
    }
  }
  const col = (cells: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (cells[i] ?? '').trim() : '';
  };

  const rows: ParsedImportRow[] = [];
  const errors: BulkImportRowError[] = [];

  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    try {
      const text = col(cells, 'text');
      if (!text) throw new Error('text is required');
      if (text.length > BANK_LIMITS.textMax) throw new Error(`text is longer than ${BANK_LIMITS.textMax} characters`);

      const type = col(cells, 'type').toUpperCase() as QuestionType;
      if (type === QuestionType.CODING) {
        throw new Error('coding questions can\'t be imported; create them in the question editor');
      }
      if (!IMPORTABLE_TYPES.includes(type)) throw new Error(`invalid type "${col(cells, 'type')}"`);

      const marks = Number(col(cells, 'marks'));
      if (!Number.isFinite(marks) || marks < 0 || marks > BANK_LIMITS.marksMax) {
        throw new Error('marks must be a number between 0 and 1000');
      }
      const negRaw = col(cells, 'negative_marks');
      const negativeMarks = negRaw === '' ? null : Number(negRaw);
      if (negativeMarks !== null && (!Number.isFinite(negativeMarks) || negativeMarks < 0)) {
        throw new Error('negative_marks must be a non-negative number');
      }

      const diffRaw = col(cells, 'difficulty').toUpperCase();
      if (diffRaw && !Object.values(QuestionDifficulty).includes(diffRaw as QuestionDifficulty)) {
        throw new Error(`invalid difficulty "${col(cells, 'difficulty')}" (use EASY, MEDIUM or HARD)`);
      }
      const statusRaw = col(cells, 'status').toUpperCase();
      if (statusRaw && !Object.values(QuestionStatus).includes(statusRaw as QuestionStatus)) {
        throw new Error(`invalid status "${col(cells, 'status')}" (use DRAFT, READY or ARCHIVED)`);
      }
      const courseId = col(cells, 'course_id') || null;
      if (courseId && !UUID_RE.test(courseId)) throw new Error('course_id must be a UUID');

      const topicName = col(cells, 'topic') || null;
      if (topicName && topicName.length > 100) throw new Error('topic is longer than 100 characters');

      const tags = normalizeTags(col(cells, 'tags').split(/[;|]/));
      if (tags.length > BANK_LIMITS.tagsMax) throw new Error(`at most ${BANK_LIMITS.tagsMax} tags`);

      const options = parseOptions(cells, col, type);
      validateOptionsForType(type, options);

      rows.push({
        line,
        text,
        type,
        marks,
        negativeMarks,
        explanation: col(cells, 'explanation') || null,
        difficulty: (diffRaw as QuestionDifficulty) || null,
        topicName,
        courseId,
        status: (statusRaw as QuestionStatus) || QuestionStatus.READY,
        tags,
        options,
      });
    } catch (err) {
      errors.push({ row: line, message: (err as Error).message });
    }
  });
  return { rows, errors };
}

function parseOptions(
  cells: string[],
  col: (cells: string[], name: string) => string,
  type: QuestionType,
): { text: string; isCorrect: boolean; order: number }[] {
  // Keep each option's column number so "correct" still points at the right
  // one when a column in between is left empty.
  const given: { num: number; text: string }[] = [];
  for (let i = 1; i <= MAX_OPTIONS; i++) {
    const t = col(cells, `option${i}`);
    if (t) given.push({ num: i, text: t });
  }
  const correctRaw = col(cells, 'correct').toLowerCase();

  if (type === QuestionType.TRUE_FALSE && given.length === 0) {
    given.push({ num: 1, text: 'True' }, { num: 2, text: 'False' });
  }
  let correct: Set<number>;
  if (type === QuestionType.TRUE_FALSE && (correctRaw === 'true' || correctRaw === 'false')) {
    const want = correctRaw === 'true' ? 'true' : 'false';
    const match = given.find((g) => g.text.toLowerCase() === want);
    if (!match) throw new Error(`correct is "${correctRaw}" but no option says "${want}"`);
    correct = new Set([match.num]);
  } else {
    const nums = correctRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    if (nums.length === 0) throw new Error('correct is required (option numbers, e.g. "2" or "1;3")');
    const available = new Set(given.map((g) => g.num));
    correct = new Set(
      nums.map((n) => {
        const k = Number(n);
        if (!Number.isInteger(k) || !available.has(k)) {
          throw new Error(`correct refers to option ${n}, which is empty or doesn't exist`);
        }
        return k;
      }),
    );
  }
  return given.map((g, i) => ({ text: g.text, isCorrect: correct.has(g.num), order: i }));
}
