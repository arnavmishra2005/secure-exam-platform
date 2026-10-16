/**
 * Owner: Person B.
 *
 * End-of-attempt grading for coding questions. A sweep (every 15 s) picks
 * finalized attempts whose CODING questions have no final submission and,
 * for each one:
 *   1. the latest GRADED submit made before `submittedAt` becomes final, or
 *   2. if there is none, the saved draft is run against all tests, or
 *   3. if there is no draft either, a 0-score final row is written.
 * The final row and the score go in one transaction; the unique
 * final-submission index makes it safe to retry or race.
 *
 * A sweep instead of a hook in the finalize path keeps attempt/answer code
 * untouched and survives restarts: anything missed is graded next tick.
 * Grading waits for a sandbox failure to clear rather than recording 0.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
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
import { evaluate } from './grading/evaluate';
import { CODE_SCORE_SINK, ICodeScoreSink } from './score-sink/code-score-sink.interface';

const SWEEP_INTERVAL_MS = 15_000;
const BATCH_SIZE = 50;
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

export type GradeOutcome = 'FROM_SUBMIT' | 'FROM_DRAFT' | 'NO_CODE' | 'DEFERRED' | 'ALREADY_GRADED';

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
      const pending = await this.attempts.findAwaitingCodeGrading(BATCH_SIZE);
      for (const item of pending) {
        try {
          await this.gradeOne(item);
        } catch (err) {
          this.logger.error(
            `Grading attempt ${item.attemptId} question ${item.questionId} failed: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Code grading sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  async gradeOne(item: PendingCodeGrade): Promise<GradeOutcome> {
    const question = await this.questionRepo.findOne({ where: { id: item.questionId } });
    const marks = question?.marks ?? 0;

    // 1. The last submit before the attempt ended.
    const lastSubmit = await this.submissionRepo.findOne({
      where: {
        attemptId: item.attemptId,
        questionId: item.questionId,
        isFinal: false,
        status: CodeSubmissionStatus.GRADED,
        createdAt: LessThanOrEqual(item.submittedAt),
      },
      order: { createdAt: 'DESC' },
    });
    if (lastSubmit) {
      return this.finalize(item, lastSubmit.score, marks, 'FROM_SUBMIT', async (repo) => {
        await repo.update({ id: lastSubmit.id }, { isFinal: true });
      });
    }

    // 2. The saved draft, graded now.
    const draft = (await this.attempts.getDraftCode(item.attemptId, item.questionId)) ?? '';
    const problem = await this.problemRepo.findOne({ where: { questionId: item.questionId } });
    const tests = problem ? await this.resolver.allTests(item.questionId) : [];

    if (draft.trim().length === 0 || !problem || tests.length === 0) {
      // 3. Nothing gradeable: record 0 so the question is settled.
      return this.finalize(item, 0, marks, 'NO_CODE', async (repo) => {
        await repo.insert(
          this.finalRow(item, draft, marks, { passed: 0, total: tests.length, score: 0, results: [] }),
        );
      });
    }

    const language = problem.allowedLanguages[0] ?? CodeLanguage.PYTHON;
    const outcomes = await this.limiter.runShared(() =>
      this.executor.runBatch({
        language,
        code: draft,
        inputs: tests.map((t) => t.input),
        limits: { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
      }),
    );
    const evaluation = evaluate(tests, outcomes, problem.comparisonMode, marks);
    if (!evaluation.sandboxOk) {
      this.logger.warn(`Sandbox unavailable while grading attempt ${item.attemptId}; will retry`);
      return 'DEFERRED';
    }

    return this.finalize(item, evaluation.score, marks, 'FROM_DRAFT', async (repo) => {
      await repo.insert({ ...this.finalRow(item, draft, marks, evaluation), language });
    });
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
        await writeFinalRow(manager.getRepository(CodeSubmissionEntity));
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
      {
        attemptId: item.attemptId,
        examId: item.examId,
        questionId: item.questionId,
        score,
        maxScore,
        source: outcome,
      },
      item.studentId,
    );
    return outcome;
  }
}
