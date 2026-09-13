import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { AnswerEntity } from './entities/answer.entity';
import { SubmissionEntity } from './entities/submission.entity';
import { ResultEntity } from './entities/result.entity';
import { AttemptService } from '../attempt/attempt.service';
import { TimerService } from '../attempt/timer.service';
import { AttemptStatus } from '@secure-exam/types';
import type { JwtPayload, Result, Submission } from '@secure-exam/types';
import { SubmitAttemptDto } from '@secure-exam/validation';
import {
  IQuestionLookupService,
  isObjective,
  QUESTION_LOOKUP_SERVICE,
  QuestionLookupInfo,
} from './question-lookup/question-lookup.interface';
// Person A's contract (assumed to exist — task-breakdown doc, section 3).
import { AuditService } from '../audit/audit.service';
import { logAuditSafely } from '../attempt/audit-safe.util';

/** Internal shape returned by finalizeLocked() — enough for both the caller and audit logging. */
interface FinalizeOutcome {
  submission: SubmissionEntity;
  result: ResultEntity;
  answeredCount: number;
  totalQuestions: number;
  examId: string;
  studentId: string;
}

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    @InjectRepository(SubmissionEntity) private readonly submissionRepository: Repository<SubmissionEntity>,
    @InjectRepository(ResultEntity) private readonly resultRepository: Repository<ResultEntity>,
    private readonly attemptService: AttemptService,
    private readonly timerService: TimerService,
    @Inject(QUESTION_LOOKUP_SERVICE) private readonly questionLookup: IQuestionLookupService,
    private readonly auditService: AuditService,
    // Assumes the project's root TypeOrmModule.forRoot() is registered as
    // usual — @nestjs/typeorm's core module is @Global(), so DataSource is
    // injectable here with no extra wiring in answer.module.ts.
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ---- Shared locking primitive ----------------------------------------

  /**
   * Runs `work` while holding a Postgres `pessimistic_write` lock
   * (`SELECT ... FOR UPDATE`) on the attempt row, inside one transaction,
   * after re-verifying — under that lock — that the attempt is still
   * IN_PROGRESS.
   *
   * This is the ONE place that acquires this lock, and both AnswerService
   * (before writing an Answer row) and this service's own finalize path
   * (before reading the answer snapshot and writing Submission/Result) go
   * through it. That's deliberate: it's what guarantees an answer save and
   * a submission finalize can never interleave. Whichever of the two
   * acquires the lock first runs to completion (commit or rollback) before
   * the other's lock acquisition is even granted by Postgres — so a
   * submission's answer snapshot can never miss an answer that a
   * concurrent save is in the middle of writing, and an answer can never
   * be written into an attempt that has, by the time the lock is granted,
   * already been finalized by someone else.
   *
   * Throws ConflictException if the attempt is no longer IN_PROGRESS by
   * the time the lock is acquired (already finalized — by this request's
   * own earlier work, or a concurrent one that won the race). This is what
   * turns "two concurrent submits" from a raw unique-constraint 500 into a
   * deterministic "one 200, one 409".
   *
   * Deliberately does NOT re-check expiry here (only status) — expiry-
   * triggered finalization is handled by the caller (see
   * assertAttemptIsWritable) *before* this is invoked. There is a narrow,
   * intentionally-accepted window where an answer could be written a
   * moment after `expiresAt` has passed but before anything has yet
   * noticed and flipped the status — closing that completely would mean
   * re-deriving the full auto-submit sequence inside every locked answer
   * write, which is a lot of added complexity for a race measured in
   * milliseconds. The periodic expiry sweep (see sweepExpiredAttempts)
   * bounds how long that window can matter in practice.
   */
  async withLockedInProgressAttempt<T>(
    attemptId: string,
    work: (manager: EntityManager, attempt: AttemptEntity) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const attempt = await manager.getRepository(AttemptEntity).findOne({
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!attempt) {
        throw new NotFoundException('Attempt not found');
      }
      if (attempt.status !== AttemptStatus.IN_PROGRESS) {
        throw new ConflictException('This attempt has already been submitted');
      }
      return work(manager, attempt);
    });
  }

  // ---- Guard used by AnswerService before every answer save -----------

  /**
   * Ownership + status + expiry guard called by AnswerService before it
   * writes an answer. The status/expiry check here is a fast, UNLOCKED
   * pre-filter — it can reject an obviously-invalid request (already
   * submitted, or expired) without opening a transaction at all. It is
   * NOT the source of truth for "will the write still be valid a moment
   * from now" under concurrency; AnswerService still does its actual
   * write via `withLockedInProgressAttempt`, which re-verifies under the
   * lock and is what makes the guarantee real.
   *
   * If the attempt has expired, finalizes it as AUTO_SUBMITTED (via the
   * same locked path used everywhere else) and rejects this specific
   * request — the auto-submit is a fully separate, already-committed
   * transaction by the time the ForbiddenException below is thrown, so a
   * failure in the write this call was guarding never leaves the
   * auto-submit half-done.
   */
  async assertAttemptIsWritable(attemptId: string, user: JwtPayload): Promise<AttemptEntity> {
    const attempt = await this.attemptService.findOwnedAttemptOrThrow(attemptId, user);

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException('This attempt has already been submitted');
    }

    if (!this.timerService.isAttemptValid(new Date(), attempt.expiresAt)) {
      const outcome = await this.withLockedInProgressAttempt(attemptId, (manager, lockedAttempt) =>
        this.finalizeLocked(manager, lockedAttempt, true),
      );
      await this.logFinalizeAudit(outcome, true, attempt.studentId);
      throw new ForbiddenException('This attempt has expired and was automatically submitted');
    }

    return attempt;
  }

  // ---- Student: POST /attempts/:id/submit ------------------------------

  async submit(
    attemptId: string,
    user: JwtPayload,
    _dto: SubmitAttemptDto,
  ): Promise<{ submission: Submission; result: Result }> {
    const attempt = await this.attemptService.findOwnedAttemptOrThrow(attemptId, user);

    // Fast, unlocked pre-check — rejects the common "already submitted"
    // case without opening a transaction. The real guarantee under
    // concurrency comes from withLockedInProgressAttempt's re-check below.
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException('This attempt has already been submitted');
    }

    const isAutoSubmit = !this.timerService.isAttemptValid(new Date(), attempt.expiresAt);

    // If this call loses a race against a concurrent submit for the same
    // attempt, withLockedInProgressAttempt throws ConflictException here —
    // that's the fix for "concurrent submit returns 500": the loser gets a
    // clean, deterministic 409 instead of a raw constraint-violation error.
    const outcome = await this.withLockedInProgressAttempt(attemptId, (manager, lockedAttempt) =>
      this.finalizeLocked(manager, lockedAttempt, isAutoSubmit),
    );

    await this.logFinalizeAudit(outcome, isAutoSubmit, user.sub);

    return { submission: toSubmissionDto(outcome.submission), result: toResultDto(outcome.result) };
  }

  /**
   * The actual finalize write path: attempt-status flip, Submission
   * insert, and Result insert, all through the SAME manager the caller is
   * already holding the attempt's row lock under — so they commit or roll
   * back together (the original data-consistency fix), AND the answer
   * snapshot below is read under that same lock (the fix for "submission
   * can race with answer saving": see withLockedInProgressAttempt's doc
   * comment for why that closes the gap).
   *
   * Must only ever be called with an `attempt` that the caller already
   * fetched-and-locked via `withLockedInProgressAttempt` — it does not
   * re-verify status itself, by design, since re-checking twice would just
   * be redundant inside the same lock.
   */
  private async finalizeLocked(
    manager: EntityManager,
    attempt: AttemptEntity,
    isAutoSubmitted: boolean,
  ): Promise<FinalizeOutcome> {
    const answers = await manager.getRepository(AnswerEntity).find({ where: { attemptId: attempt.id } });
    const questions = await this.questionLookup.getQuestionsForExam(attempt.examId);

    const answeredCount = answers.filter(
      (a) =>
        (!!a.selectedOptionIds && a.selectedOptionIds.length > 0) ||
        (!!a.textResponse && a.textResponse.trim().length > 0),
    ).length;

    const { score, maxScore, autoGraded, needsManualReview } = computeScore(questions, answers);

    if (isAutoSubmitted) {
      await this.attemptService.markAutoSubmitted(attempt.id, manager);
    } else {
      await this.attemptService.markSubmitted(attempt.id, manager);
    }

    const submissionRepo = manager.getRepository(SubmissionEntity);
    const savedSubmission = await submissionRepo.save(
      submissionRepo.create({
        attemptId: attempt.id,
        submittedAt: new Date(),
        isAutoSubmitted,
        totalQuestions: questions.length,
        answeredCount,
      }),
    );

    const resultRepo = manager.getRepository(ResultEntity);
    const savedResult = await resultRepo.save(
      resultRepo.create({
        attemptId: attempt.id,
        examId: attempt.examId,
        studentId: attempt.studentId,
        score,
        maxScore,
        autoGraded,
        needsManualReview,
        published: false,
        publishedAt: null,
      }),
    );

    return {
      submission: savedSubmission,
      result: savedResult,
      answeredCount,
      totalQuestions: questions.length,
      examId: attempt.examId,
      studentId: attempt.studentId,
    };
  }

  /**
   * Audit logging deliberately happens AFTER the transaction has
   * committed, never inside it — see audit-safe.util.ts for why (in
   * short: AuditService's assumed contract can't participate in a DB
   * transaction, and a logging hiccup after a real commit must not make a
   * successful submission look like a failed request).
   */
  private async logFinalizeAudit(
    outcome: FinalizeOutcome,
    isAutoSubmitted: boolean,
    actorId: string,
  ): Promise<void> {
    await logAuditSafely(
      this.logger,
      this.auditService,
      isAutoSubmitted ? 'AUTO_SUBMITTED' : 'SUBMITTED',
      {
        attemptId: outcome.submission.attemptId,
        examId: outcome.examId,
        answeredCount: outcome.answeredCount,
        totalQuestions: outcome.totalQuestions,
      },
      actorId,
    );
  }

  // ---- Defense in depth: periodic expiry sweep (issue: attempts that never receive traffic again) ----

  /**
   * Scans for IN_PROGRESS attempts whose server-authoritative `expiresAt`
   * has already passed and finalizes each one as AUTO_SUBMITTED. This is
   * defense in depth alongside the lazy auto-submit built into
   * `assertAttemptIsWritable`/`submit` (which only fires when an attempt
   * happens to be touched again) — it closes out attempts nobody ever
   * comes back to, so Result data and the monitoring screen stay accurate
   * even for fully abandoned attempts. See AttemptExpirySweepService for
   * the scheduler that calls this periodically.
   *
   * Each attempt is finalized independently (its own lock, its own
   * transaction) so one failure — including simply losing a race to a
   * concurrent request that finalizes the same attempt first, which is
   * expected and harmless — never blocks the rest of the sweep.
   */
  async sweepExpiredAttempts(now: Date = new Date()): Promise<{ sweptCount: number; failedCount: number }> {
    const expiredIds = await this.attemptService.findExpiredInProgressAttemptIds(now);
    let sweptCount = 0;
    let failedCount = 0;

    for (const attemptId of expiredIds) {
      try {
        const outcome = await this.withLockedInProgressAttempt(attemptId, (manager, attempt) =>
          this.finalizeLocked(manager, attempt, true),
        );
        await this.logFinalizeAudit(outcome, true, outcome.studentId);
        sweptCount++;
      } catch (err) {
        if (err instanceof ConflictException) {
          // Another request (or a previous sweep tick) already finalized
          // this attempt between the scan above and this iteration —
          // expected under concurrency, not a real failure.
          this.logger.debug(`Expiry sweep: attempt ${attemptId} was already finalized by another request`);
        } else {
          failedCount++;
          this.logger.error(
            `Expiry sweep: failed to auto-submit attempt ${attemptId}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }
    }

    return { sweptCount, failedCount };
  }

  // ---- Admin: submissions list + result publishing (/results screen) ----

  async listSubmissions(query: {
    examId?: string;
    published?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{
    items: { submission: Submission; result: Result | null }[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoinAndMapOne(
        'submission.result',
        ResultEntity,
        'result',
        'result.attemptId = submission.attemptId',
      );

    if (query.examId) {
      qb.andWhere('result.examId = :examId', { examId: query.examId });
    }
    if (query.published !== undefined) {
      qb.andWhere('result.published = :published', { published: query.published });
    }

    qb.orderBy('submission.submittedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: (rows as (SubmissionEntity & { result?: ResultEntity })[]).map((row) => ({
        submission: toSubmissionDto(row),
        result: row.result ? toResultDto(row.result) : null,
      })),
      total,
      page,
      limit,
    };
  }

  async getResultForAttempt(attemptId: string): Promise<Result> {
    const result = await this.resultRepository.findOne({ where: { attemptId } });
    if (!result) throw new NotFoundException('Result not found for this attempt');
    return toResultDto(result);
  }

  /**
   * `score` is validated against this result's own `maxScore` — an admin
   * cannot set a score above the maximum the attempt could actually earn.
   * Decimal scores ARE valid (partial-credit marking schemes are common;
   * the DTO caps precision at 2 decimal places — see OverrideResultScoreDto).
   */
  async overrideScore(attemptId: string, score: number, adminId: string): Promise<Result> {
    const result = await this.resultRepository.findOne({ where: { attemptId } });
    if (!result) throw new NotFoundException('Result not found for this attempt');

    if (score > result.maxScore) {
      throw new BadRequestException(
        `Score (${score}) cannot exceed this attempt's maximum of ${result.maxScore}`,
      );
    }

    result.score = score;
    result.needsManualReview = false;
    const saved = await this.resultRepository.save(result);

    // Extra audit event beyond the doc's core six — see README if the
    // team wants to keep AuditEventType limited to exactly those six.
    await logAuditSafely(
      this.logger,
      this.auditService,
      'RESULT_SCORE_OVERRIDDEN',
      { attemptId, newScore: score },
      adminId,
    );

    return toResultDto(saved);
  }

  async setPublished(attemptId: string, publish: boolean, adminId: string): Promise<Result> {
    const result = await this.resultRepository.findOne({ where: { attemptId } });
    if (!result) throw new NotFoundException('Result not found for this attempt');

    result.published = publish;
    result.publishedAt = publish ? new Date() : null;
    const saved = await this.resultRepository.save(result);

    await logAuditSafely(
      this.logger,
      this.auditService,
      publish ? 'RESULT_PUBLISHED' : 'RESULT_UNPUBLISHED',
      { attemptId, examId: result.examId },
      adminId,
    );

    return toResultDto(saved);
  }
}

function computeScore(
  questions: QuestionLookupInfo[],
  answers: AnswerEntity[],
): { score: number; maxScore: number; autoGraded: boolean; needsManualReview: boolean } {
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));
  let score = 0;
  let maxScore = 0;
  let needsManualReview = false;

  for (const q of questions) {
    maxScore += q.marks;
    const answer = answerByQuestion.get(q.id);

    if (isObjective(q.answerFormat)) {
      if (!answer) continue;
      const correct = new Set(q.correctOptionIds ?? []);
      const selected = new Set(answer.selectedOptionIds ?? []);
      // Exact-set match required for credit (including MULTIPLE_CHOICE) —
      // no partial credit for a partially-correct multi-select. A
      // deliberate simplicity choice, not an oversight.
      const isCorrect =
        correct.size > 0 && correct.size === selected.size && [...correct].every((id) => selected.has(id));
      if (isCorrect) score += q.marks;
    } else {
      // TEXT / subjective — cannot be auto-graded.
      needsManualReview = true;
    }
  }

  return { score, maxScore, autoGraded: !needsManualReview, needsManualReview };
}

export function toSubmissionDto(entity: SubmissionEntity): Submission {
  return {
    id: entity.id,
    attemptId: entity.attemptId,
    submittedAt: entity.submittedAt.toISOString(),
    isAutoSubmitted: entity.isAutoSubmitted,
    totalQuestions: entity.totalQuestions,
    answeredCount: entity.answeredCount,
    createdAt: entity.createdAt.toISOString(),
  };
}

export function toResultDto(entity: ResultEntity): Result {
  return {
    id: entity.id,
    attemptId: entity.attemptId,
    examId: entity.examId,
    studentId: entity.studentId,
    score: entity.score,
    maxScore: entity.maxScore,
    autoGraded: entity.autoGraded,
    needsManualReview: entity.needsManualReview,
    published: entity.published,
    publishedAt: entity.publishedAt ? entity.publishedAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
