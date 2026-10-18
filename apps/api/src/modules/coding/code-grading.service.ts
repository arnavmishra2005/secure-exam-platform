/**
 * Owner: Person B.
 *
 * Server-side grading of coding questions. A sweep (every 15 s) does two jobs:
 *
 * 1. Grade finished attempts. For each finished attempt × CODING question
 *    without a final submission, the code that counts is:
 *      a. the latest Submit made before `submittedAt` — run now if it is
 *         PENDING (deferred grading), reused if already GRADED (live grading);
 *      b. else the saved draft, run now;
 *      c. else nothing: a 0-score final row settles the question.
 *    The score is added to the attempt's result (CODE_SCORE_SINK).
 *
 * 2. Rerun queued answers. After a professor edits a question's tests and
 *    recalculates, final submissions are set back to PENDING. Each is run
 *    again; once an attempt has nothing left queued, its total is recomputed
 *    from scratch (ResultTotalsService).
 *
 * Final rows and score changes are written in one transaction. The unique
 * final-submission index makes retries and races safe. A sandbox failure
 * leaves the work for the next sweep instead of recording 0.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { AuditEventType, CodeLanguage, CodeSubmissionStatus } from '@secure-exam/types';
import { AuditService } from '../audit/audit.service';
import { logAuditSafely } from '../attempt/audit-safe.util';
import { EXECUTION_PROVIDER, ExecutionProvider } from '../execution/execution-provider.interface';
import { RunLimiterService } from '../execution/run-limiter.service';
import { QuestionEntity } from '../question/entities/question.entity';
import { ATTEMPT_ACCESS, IAttemptAccess, PendingCodeGrade } from './attempt-access/attempt-access.interface';
import { CodingQuestionResolver } from './coding-question.resolver';
import { CodeSubmissionEntity } from './entities/code-submission.entity';
import { CodingProblemEntity } from './entities/coding-problem.entity';
import { evaluate, type Evaluation } from './grading/evaluate';
import { ResultTotalsService } from './result-totals.service';
import { CODE_SCORE_SINK, ICodeScoreSink } from './score-sink/code-score-sink.interface';

const SWEEP_INTERVAL_MS = 15_000;
const BATCH_SIZE = 50;
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

export type GradeOutcome =
  | 'FROM_SUBMIT'
  | 'FROM_DRAFT'
  | 'NO_CODE'
  | 'DEFERRED'
  | 'ALREADY_GRADED'
  | 'REGRADED';

@Injectable()
export class CodeGradingService {
  private readonly logger = new Logger(CodeGradingService.name);
  private sweeping = false;

  constructor(
    @Inject(ATTEMPT_ACCESS) private readonly attempts: IAttemptAccess,
    @Inject(EXECUTION_PROVIDER) private readonly executor: ExecutionProvider,
    @Inject(CODE_SCORE_SINK) private readonly scoreSink: ICodeScoreSink,
    private readonly limiter: RunLimiterService,
    private readonly resolver: CodingQuestionResolver,
    private readonly totals: ResultTotalsService,
    @InjectRepository(CodeSubmissionEntity)
    private readonly submissionRepo: Repository<CodeSubmissionEntity>,
    @InjectRepository(CodingProblemEntity)
    private readonly problemRepo: Repository<CodingProblemEntity>,
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    if (this.sweeping) return; // a slow sweep must not overlap the next tick
    this.sweeping = true;
    try {
      await this.forEach(await this.attempts.findAwaitingCodeGrading(BATCH_SIZE), (item) => this.gradeOne(item));
      const queued = await this.submissionRepo.find({
        where: { isFinal: true, status: CodeSubmissionStatus.PENDING },
        order: { createdAt: 'ASC' },
        take: BATCH_SIZE,
      });
      await this.forEach(queued, (row) => this.rerunFinal(row));
    } catch (err) {
      this.logger.error(`Code grading sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  // ---------------------------------------------------------------------
  // Job 1: grade a finished attempt's coding question
  // ---------------------------------------------------------------------

  async gradeOne(item: PendingCodeGrade): Promise<GradeOutcome> {
    const question = await this.questionRepo.findOne({ where: { id: item.questionId } });
    const marks = question?.marks ?? 0;

    // a. The latest Submit before the attempt ended.
    const lastSubmit = await this.submissionRepo.findOne({
      where: {
        attemptId: item.attemptId,
        questionId: item.questionId,
        isFinal: false,
        status: In([CodeSubmissionStatus.GRADED, CodeSubmissionStatus.PENDING]),
        createdAt: LessThanOrEqual(item.submittedAt),
      },
      order: { createdAt: 'DESC' },
    });
    if (lastSubmit?.status === CodeSubmissionStatus.GRADED) {
      return this.finalize(item, lastSubmit.score, marks, 'FROM_SUBMIT', async (repo) => {
        await repo.update({ id: lastSubmit.id }, { isFinal: true });
      });
    }
    if (lastSubmit) {
      const evaluation = await this.runAllTests(lastSubmit.questionId, lastSubmit.code, marks);
      if (evaluation === 'SANDBOX_DOWN') return 'DEFERRED';
      return this.finalize(item, evaluation.score, marks, 'FROM_SUBMIT', async (repo) => {
        await repo.update({ id: lastSubmit.id }, { ...gradedFields(evaluation, marks), isFinal: true });
      });
    }

    // b. The saved draft.
    const draft = (await this.attempts.getDraftCode(item.attemptId, item.questionId)) ?? '';
    const evaluation = draft.trim() ? await this.runAllTests(item.questionId, draft, marks) : null;
    if (evaluation === 'SANDBOX_DOWN') return 'DEFERRED';

    if (!evaluation) {
      // c. Nothing gradeable: record 0 so the question is settled.
      return this.finalize(item, 0, marks, 'NO_CODE', async (repo) => {
        await repo.insert(this.finalRow(item, draft, marks, { passed: 0, total: 0, score: 0, results: [] }));
      });
    }
    return this.finalize(item, evaluation.score, marks, 'FROM_DRAFT', async (repo) => {
      await repo.insert(this.finalRow(item, draft, marks, evaluation));
    });
  }

  // ---------------------------------------------------------------------
  // Job 2: rerun a final submission queued by a recalculation
  // ---------------------------------------------------------------------

  async rerunFinal(row: CodeSubmissionEntity): Promise<GradeOutcome> {
    const question = await this.questionRepo.findOne({ where: { id: row.questionId } });
    const marks = question?.marks ?? 0;
    const evaluation = row.code.trim() ? await this.runAllTests(row.questionId, row.code, marks) : null;
    if (evaluation === 'SANDBOX_DOWN') return 'DEFERRED';

    const graded = gradedFields(evaluation, marks);
    const attempt = await this.attempts.getFinishedAttempt(row.attemptId);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CodeSubmissionEntity);
      await repo.update({ id: row.id, status: CodeSubmissionStatus.PENDING }, graded);
      const stillQueued = await repo.count({
        where: { attemptId: row.attemptId, isFinal: true, status: CodeSubmissionStatus.PENDING },
      });
      if (attempt && stillQueued === 0) await this.totals.recompute(manager, attempt.examId, row.attemptId);
    });

    await logAuditSafely(
      this.logger,
      this.auditService,
      AuditEventType.CODE_GRADED,
      { attemptId: row.attemptId, examId: attempt?.examId, questionId: row.questionId, score: graded.score, source: 'REGRADE' },
      row.studentId,
    );
    return 'REGRADED';
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /** Runs `code` against all of the question's tests. No problem/tests → 0 marks (not a failure). */
  private async runAllTests(questionId: string, code: string, marks: number): Promise<Evaluation | 'SANDBOX_DOWN'> {
    const problem = await this.problemRepo.findOne({ where: { questionId } });
    const tests = problem ? await this.resolver.allTests(questionId) : [];
    if (!problem || tests.length === 0) {
      return { sandboxOk: true, results: [], passed: 0, total: 0, score: 0, maxScore: marks };
    }
    const outcomes = await this.limiter.runShared(() =>
      this.executor.runBatch({
        language: problem.allowedLanguages[0] ?? CodeLanguage.PYTHON,
        code,
        inputs: tests.map((t) => t.input),
        limits: { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
      }),
    );
    const evaluation = evaluate(tests, outcomes, problem.comparisonMode, marks);
    if (!evaluation.sandboxOk) {
      this.logger.warn(`Sandbox unavailable while grading question ${questionId}; will retry`);
      return 'SANDBOX_DOWN';
    }
    return evaluation;
  }

  private async forEach<T>(items: T[], work: (item: T) => Promise<unknown>) {
    for (const item of items) {
      try {
        await work(item);
      } catch (err) {
        this.logger.error(`Grading failed: ${(err as Error).message}`);
      }
    }
  }

  private finalRow(
    item: PendingCodeGrade,
    code: string,
    marks: number,
    graded: { passed: number; total: number; score: number; results: CodeSubmissionEntity['resultsJson'] },
  ): Partial<CodeSubmissionEntity> {
    return {
      attemptId: item.attemptId,
      questionId: item.questionId,
      studentId: item.studentId,
      language: CodeLanguage.PYTHON,
      code,
      status: CodeSubmissionStatus.GRADED,
      passed: graded.passed,
      total: graded.total,
      score: graded.score,
      maxScore: marks,
      resultsJson: graded.results,
      isFinal: true,
      fromDraft: true,
    };
  }

  /** Marks the final row and records the score atomically. */
  private async finalize(
    item: PendingCodeGrade,
    score: number,
    maxScore: number,
    outcome: GradeOutcome,
    writeFinalRow: (repo: Repository<CodeSubmissionEntity>) => Promise<void>,
  ): Promise<GradeOutcome> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(CodeSubmissionEntity);
        await writeFinalRow(repo);
        // Earlier saved Submits that were never graded: replaced by the one that counted.
        await repo.update(
          { attemptId: item.attemptId, questionId: item.questionId, isFinal: false, status: CodeSubmissionStatus.PENDING },
          { status: CodeSubmissionStatus.SUPERSEDED },
        );
        await this.scoreSink.record(manager, {
          attemptId: item.attemptId,
          examId: item.examId,
          questionId: item.questionId,
          studentId: item.studentId,
          score,
          maxScore,
        });
      });
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) return 'ALREADY_GRADED';
      throw err;
    }

    await logAuditSafely(
      this.logger,
      this.auditService,
      AuditEventType.CODE_GRADED,
      { attemptId: item.attemptId, examId: item.examId, questionId: item.questionId, score, maxScore, source: outcome },
      item.studentId,
    );
    return outcome;
  }
}

/** Columns a graded submission row gets. `null` = no code: zero marks, no tests. */
function gradedFields(evaluation: Evaluation | null, marks: number): Partial<CodeSubmissionEntity> & { score: number } {
  return {
    status: CodeSubmissionStatus.GRADED,
    passed: evaluation?.passed ?? 0,
    total: evaluation?.total ?? 0,
    score: evaluation?.score ?? 0,
    maxScore: marks,
    resultsJson: evaluation?.results ?? [],
  };
}
