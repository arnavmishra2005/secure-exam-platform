/**
 * Owner: Person B. Question-wise results for an exam (staff only):
 * the students × questions matrix with per-question stats, and a
 * per-attempt drill-down including submitted code and test results.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import {
  CodeLanguage,
  decodeCodeDraft,
  CodeSubmissionStatus,
  QuestionType,
  type AttemptDrilldown,
  type DrilldownCode,
  type DrilldownQuestion,
  type QuestionAnalyticsMatrix,
  type ScoreAdjustmentInfo,
} from '@secure-exam/types';
import { CodeRunEntity } from '../coding/entities/code-run.entity';
import { CodeSubmissionEntity } from '../coding/entities/code-submission.entity';
import { CodingTestCaseEntity } from '../coding/entities/coding-test-case.entity';
import { ExamEntity } from '../exam/entities/exam.entity';
import { QuestionService } from '../question/question.service';
import { QuestionScoreEntity } from '../results/entities/question-score.entity';
import { ExamAttemptDataAdapter } from './exam-attempt-data.adapter';
import {
  adjustmentKey,
  buildMatrix,
  type AdjustmentMap,
  type MatrixAttempt,
  type MatrixQuestion,
  type SubmittedKeys,
} from './matrix';

/** A matrix question that also carries option texts (for the drill-down). */
type ExamQuestion = Omit<MatrixQuestion, 'options'> & {
  options: { id: string; text: string; isCorrect: boolean }[];
};

@Injectable()
export class QuestionAnalyticsService {
  constructor(
    @InjectRepository(ExamEntity) private readonly examRepo: Repository<ExamEntity>,
    @InjectRepository(CodeSubmissionEntity) private readonly submissionRepo: Repository<CodeSubmissionEntity>,
    @InjectRepository(CodeRunEntity) private readonly runRepo: Repository<CodeRunEntity>,
    @InjectRepository(CodingTestCaseEntity) private readonly testCaseRepo: Repository<CodingTestCaseEntity>,
    @InjectRepository(QuestionScoreEntity) private readonly scoreRepo: Repository<QuestionScoreEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly questionService: QuestionService,
    private readonly attemptData: ExamAttemptDataAdapter,
  ) {}

  async matrix(examId: string): Promise<QuestionAnalyticsMatrix> {
    const exam = await this.exam(examId);
    const questions = await this.questions(examId);
    const attempts = await this.attemptData.attempts(examId);
    const adjusted = await this.adjustmentRows(attempts.map((a) => a.attemptId));
    const result = await this.compute(questions, attempts, undefined, toMap(adjusted));
    return { exam: { id: exam.id, title: exam.title, status: exam.status }, ...result };
  }

  async drilldown(examId: string, attemptId: string): Promise<AttemptDrilldown> {
    const exam = await this.exam(examId);
    const [attempt] = await this.attemptData.attempts(examId, attemptId);
    if (!attempt) throw new NotFoundException('Attempt not found for this exam');

    const questions = await this.questions(examId);
    const answers = await this.attemptData.answers([attemptId]);
    const adjusted = await this.adjustmentRows([attemptId]);
    const { students, cells } = await this.compute(questions, [attempt], answers, toMap(adjusted));
    const answerBy = new Map(answers.map((a) => [a.questionId, a]));
    const names = await this.userNames(adjusted.map((r) => r.adjustedBy).filter((id): id is string => !!id));
    const adjustmentBy = new Map(adjusted.map((r) => [r.questionId, r]));

    const codingIds = questions.filter((q) => q.type === QuestionType.CODING).map((q) => q.id);
    const [subs, tests, runCounts] = await Promise.all([
      codingIds.length
        ? this.submissionRepo.find({
            where: { attemptId, questionId: In(codingIds) },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([]),
      codingIds.length
        ? this.testCaseRepo.find({ where: { questionId: In(codingIds) }, order: { order: 'ASC' } })
        : Promise.resolve([]),
      this.runCounts(attemptId),
    ]);

    const out: DrilldownQuestion[] = questions.map((q, i) => {
      const cell = cells.find((c) => c.questionId === q.id)!;
      const answer = answerBy.get(q.id);
      const base: DrilldownQuestion = {
        id: q.id,
        number: i + 1,
        text: q.text,
        type: q.type,
        marks: q.marks,
        state: cell.state,
        score: cell.score,
        markedForReview: cell.markedForReview,
        answeredAt: answer?.answeredAt?.toISOString() ?? null,
        adjustment: adjustmentInfo(cell.autoScore, adjustmentBy.get(q.id), names),
      };
      if (q.type === QuestionType.CODING) {
        const qSubs = subs.filter((s) => s.questionId === q.id);
        const qTests = tests.filter((t) => t.questionId === q.id);
        return { ...base, code: this.codeDetail(qSubs, qTests, answer?.textResponse ?? null, runCounts.get(q.id) ?? 0) };
      }
      const selected = new Set(answer?.selectedOptionIds ?? []);
      return {
        ...base,
        options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, selected: selected.has(o.id) })),
      };
    });

    return { exam: { id: exam.id, title: exam.title }, student: students[0], questions: out };
  }

  // ---- Manual adjustments (#13) ----

  /** One question's cell for one attempt, without any manual adjustment. */
  async autoCell(examId: string, attemptId: string, questionId: string) {
    await this.exam(examId);
    const [attempt] = await this.attemptData.attempts(examId, attemptId);
    if (!attempt) throw new NotFoundException('Attempt not found for this exam');
    const question = (await this.questions(examId)).find((q) => q.id === questionId);
    if (!question) throw new NotFoundException('Question not found in this exam');
    const { cells } = await this.compute([question], [attempt]);
    return { attempt, question, cell: cells[0] };
  }

  /** The attempt's total with adjustments, as question-wise results show it. */
  async attemptTotal(examId: string, attemptId: string): Promise<number> {
    const [attempt] = await this.attemptData.attempts(examId, attemptId);
    if (!attempt) return 0;
    const adjusted = await this.adjustmentRows([attemptId]);
    const { students } = await this.compute(await this.questions(examId), [attempt], undefined, toMap(adjusted));
    return students[0]?.score ?? 0;
  }

  async userNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{ id: string; fullName: string }> = await this.dataSource.query(
      `SELECT id, "fullName" FROM users WHERE id = ANY($1::uuid[])`,
      [[...new Set(ids)]],
    );
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  private async adjustmentRows(attemptIds: string[]): Promise<QuestionScoreEntity[]> {
    if (attemptIds.length === 0) return [];
    return this.scoreRepo.find({ where: { attemptId: In(attemptIds), manualAdjustment: Not(0) } });
  }

  // ---------------------------------------------------------------------

  private async exam(examId: string): Promise<ExamEntity> {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException(`Exam ${examId} not found`);
    return exam;
  }

  private async questions(examId: string): Promise<ExamQuestion[]> {
    const entities = await this.questionService.getExamQuestions(examId);
    return entities.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      marks: q.marks,
      options: [...(q.options ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
    }));
  }

  private async compute(
    questions: MatrixQuestion[],
    attempts: MatrixAttempt[],
    preloadedAnswers?: Awaited<ReturnType<ExamAttemptDataAdapter['answers']>>,
    adjustments?: AdjustmentMap,
  ) {
    const ids = attempts.map((a) => a.attemptId);
    const answers = preloadedAnswers ?? (await this.attemptData.answers(ids));
    const subs = ids.length
      ? await this.submissionRepo.find({
          where: { attemptId: In(ids) },
          select: ['attemptId', 'questionId', 'isFinal', 'fromDraft', 'status', 'score', 'passed', 'total', 'code'],
        })
      : [];
    // A final row that is PENDING is queued to run again: show it as not graded yet.
    const finals = subs
      .filter((s) => s.isFinal && s.status === CodeSubmissionStatus.GRADED)
      .map((s) => ({
        attemptId: s.attemptId,
        questionId: s.questionId,
        score: s.score,
        passed: s.passed,
        total: s.total,
        hasCode: s.code.trim().length > 0,
      }));
    const submitted: SubmittedKeys = new Set(
      subs
        .filter(
          (s) =>
            (s.isFinal && s.status === CodeSubmissionStatus.PENDING) ||
            (!s.isFinal &&
              !s.fromDraft &&
              (s.status === CodeSubmissionStatus.PENDING || s.status === CodeSubmissionStatus.GRADED)),
        )
        .map((s) => `${s.attemptId}|${s.questionId}`),
    );
    return buildMatrix(questions, attempts, answers, finals, submitted, adjustments);
  }

  private async runCounts(attemptId: string): Promise<Map<string, number>> {
    const rows: Array<{ questionId: string; count: string }> = await this.runRepo
      .createQueryBuilder('r')
      .select('r.question_id', 'questionId')
      .addSelect('COUNT(*)', 'count')
      .where('r.attempt_id = :attemptId', { attemptId })
      .groupBy('r.question_id')
      .getRawMany();
    return new Map(rows.map((r) => [r.questionId, Number(r.count)]));
  }

  private codeDetail(
    subs: CodeSubmissionEntity[],
    tests: CodingTestCaseEntity[],
    draft: string | null,
    runCount: number,
  ): DrilldownCode | null {
    const submitCount = subs.filter((s) => !s.fromDraft).length;
    // A final row with no code is the 0 recorded when the student wrote nothing.
    const final = subs.find((s) => s.isFinal && s.code.trim().length > 0);
    if (!final) {
      // Not graded yet: show the latest Submit, else the autosaved draft.
      const lastSubmit = [...subs].reverse().find((s) => !s.isFinal && !s.fromDraft && s.code.trim());
      const saved = decodeCodeDraft(draft);
      const code = lastSubmit?.code ?? saved.code;
      if (!code?.trim()) return null;
      return {
        code,
        language: lastSubmit?.language ?? saved.language ?? CodeLanguage.PYTHON,
        source: lastSubmit ? 'SUBMITTED' : 'DRAFT',
        status: lastSubmit?.status ?? null,
        passed: 0,
        total: 0,
        tests: [],
        submitCount,
        runCount,
      };
    }
    if (final.status === CodeSubmissionStatus.PENDING) {
      // Queued to run again after the question was edited.
      return {
        code: final.code,
        language: final.language,
        source: final.fromDraft ? 'FINAL_DRAFT' : 'FINAL_SUBMIT',
        status: final.status,
        passed: 0,
        total: 0,
        tests: [],
        submitCount,
        runCount,
      };
    }
    const byId = new Map(tests.map((t, i) => [t.id, { test: t, index: i + 1 }]));
    return {
      code: final.code,
      language: final.language,
      source: final.fromDraft ? 'FINAL_DRAFT' : 'FINAL_SUBMIT',
      status: final.status,
      passed: final.passed,
      total: final.total,
      tests: final.resultsJson.map((r, i) => {
        const t = byId.get(r.testCaseId);
        return {
          index: t?.index ?? i + 1,
          isSample: t?.test.isSample ?? false,
          verdict: r.verdict,
          weight: r.weight,
          timeMs: r.timeMs,
          input: t?.test.input ?? '',
          expectedOutput: t?.test.expectedOutput ?? '',
          stdout: r.stdout,
          stderr: r.stderr,
        };
      }),
      submitCount,
      runCount,
    };
  }
}

function toMap(rows: QuestionScoreEntity[]): AdjustmentMap {
  return new Map(rows.map((r) => [adjustmentKey(r.attemptId, r.questionId), r.manualAdjustment]));
}

function adjustmentInfo(
  autoScore: number | undefined,
  row: QuestionScoreEntity | undefined,
  names: Map<string, string>,
): ScoreAdjustmentInfo | null {
  // No autoScore on the cell: not graded yet, so the adjustment doesn't apply right now.
  if (!row || autoScore === undefined) return null;
  return {
    autoScore,
    adjustment: row.manualAdjustment,
    reason: row.adjustReason ?? '',
    adjustedBy: row.adjustedBy ?? '',
    adjustedByName: (row.adjustedBy && names.get(row.adjustedBy)) || null,
    adjustedAt: row.adjustedAt?.toISOString() ?? '',
  };
}
