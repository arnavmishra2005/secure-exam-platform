/**
 * Owner: Person B.
 *
 * "Submit" during an attempt. Two modes (CODING_GRADING_MODE, see the
 * decision log in person_b_plan.md):
 *  - DEFERRED (default): saves the code as a PENDING submission. Nothing
 *    runs; CodeGradingService grades it against all tests after the attempt ends.
 *  - LIVE: runs all tests now and stores a GRADED submission; students see
 *    verdicts only, never hidden inputs or expected outputs.
 * Either way, the last submission made before the attempt ends counts.
 */

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AuditEventType,
  CodeSubmissionStatus,
  CodingGradingMode,
  CodeSubmitResponse,
} from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { CodeSubmitDto } from '@secure-exam/validation';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { assertAttemptSession } from '../attempt/attempt-session';
import { AttemptStatus } from '@secure-exam/types';
import { AuditService } from '../audit/audit.service';
import { logAuditSafely } from '../attempt/audit-safe.util';
import { EXECUTION_PROVIDER, ExecutionProvider } from '../execution/execution-provider.interface';
import { RunLimiterService } from '../execution/run-limiter.service';
import { ATTEMPT_ACCESS, IAttemptAccess } from './attempt-access/attempt-access.interface';
import { codingClientConfig } from './coding-config';
import { CodingQuestionResolver } from './coding-question.resolver';
import { CodeSubmissionEntity } from './entities/code-submission.entity';
import { evaluate } from './grading/evaluate';

@Injectable()
export class CodeSubmitService {
  private readonly logger = new Logger(CodeSubmitService.name);

  constructor(
    @Inject(ATTEMPT_ACCESS) private readonly attempts: IAttemptAccess,
    @Inject(EXECUTION_PROVIDER) private readonly executor: ExecutionProvider,
    private readonly limiter: RunLimiterService,
    private readonly resolver: CodingQuestionResolver,
    @InjectRepository(CodeSubmissionEntity)
    private readonly submissionRepo: Repository<CodeSubmissionEntity>,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {}

  private async saveLocked(attemptId: string, user: JwtPayload, fields: Partial<CodeSubmissionEntity>): Promise<CodeSubmissionEntity> {
    return this.submissionRepo.manager.transaction(async manager => {
      const attempt = await manager.getRepository(AttemptEntity).findOne({ where: { id: attemptId }, lock: { mode: 'pessimistic_write' } });
      if (!attempt || attempt.studentId !== user.sub) throw new ConflictException('Attempt not available');
      assertAttemptSession(attempt, user);
      if (attempt.status !== AttemptStatus.IN_PROGRESS || attempt.expiresAt.getTime() < Date.now()) throw new ConflictException('The attempt has ended');
      const repo = manager.getRepository(CodeSubmissionEntity);
      return repo.save(repo.create(fields));
    });
  }

  async latest(attemptId: string, user: JwtPayload) {
    await this.attempts.assertWritable(attemptId, user);
    const rows = await this.submissionRepo.find({ where: { attemptId, studentId: user.sub, fromDraft: false,
      status: In([CodeSubmissionStatus.PENDING, CodeSubmissionStatus.GRADED]) }, order: { createdAt: 'DESC', id: 'DESC' } });
    const seen = new Set<string>();
    return rows.filter(row => { if (seen.has(row.questionId)) return false; seen.add(row.questionId); return true; })
      .map(row => ({ questionId: row.questionId, submissionId: row.id, code: row.code, language: row.language,
        savedAt: row.createdAt.toISOString(), status: row.status }));
  }

  async submit(attemptId: string, dto: CodeSubmitDto, user: JwtPayload): Promise<CodeSubmitResponse> {
    const attempt = await this.attempts.assertWritable(attemptId, user);
    const { question, problem } = await this.resolver.resolveInExam(attempt.examId, dto.questionId);
    if (!problem.allowedLanguages.includes(dto.language)) {
      throw new BadRequestException(`${dto.language} is not allowed for this question`);
    }

    const live = codingClientConfig(this.config).gradingMode === CodingGradingMode.LIVE;
    let saved: CodeSubmissionEntity;
    let result: CodeSubmitResponse['result'];

    if (!live) {
      saved = await this.saveLocked(attemptId, user, {
          attemptId: attempt.id,
          questionId: dto.questionId,
          studentId: user.sub,
          language: dto.language,
          code: dto.code,
          status: CodeSubmissionStatus.PENDING,
          maxScore: question.marks,
          isFinal: false,
          fromDraft: false,
        });
    } else {
      const tests = await this.resolver.allTests(dto.questionId);
      if (tests.length === 0) {
        throw new ConflictException('This coding question has no test cases yet');
      }
      const outcomes = await this.limiter.run(user.sub, () =>
        this.executor.runBatch({
          language: dto.language,
          code: dto.code,
          inputs: tests.map((t) => t.input),
          limits: { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
          context: { source: 'SUBMIT', userId: user.sub, attemptId: attempt.id, examId: attempt.examId, questionId: dto.questionId },
        }),
      );
      const evaluation = evaluate(tests, outcomes, problem.comparisonMode, question.marks);
      if (!evaluation.sandboxOk) {
        // Not the student's fault: don't store a score they could be held to.
        throw new ServiceUnavailableException(
          'The code runner had a problem. Your submission was not counted; please submit again',
        );
      }
      // Execution takes seconds; the attempt may have ended meanwhile. Grading
      // also ignores submissions created after `submittedAt`, which closes
      // the small gap between this check and the insert.
      try {
        await this.attempts.assertWritable(attemptId, user);
      } catch (error) {
        if (error instanceof ConflictException && (error.getResponse() as { code?: string }).code === 'SESSION_MOVED') throw error;
        throw new ConflictException('The attempt ended before your submission finished, so it was not counted');
      }
      saved = await this.saveLocked(attemptId, user, {
          attemptId: attempt.id,
          questionId: dto.questionId,
          studentId: user.sub,
          language: dto.language,
          code: dto.code,
          status: CodeSubmissionStatus.GRADED,
          passed: evaluation.passed,
          total: evaluation.total,
          score: evaluation.score,
          maxScore: evaluation.maxScore,
          resultsJson: evaluation.results,
          isFinal: false,
          fromDraft: false,
        });
      result = {
        passed: evaluation.passed,
        total: evaluation.total,
        score: evaluation.score,
        maxScore: evaluation.maxScore,
        tests: evaluation.results.map((r, i) => ({
          index: i + 1,
          isSample: tests[i].isSample,
          verdict: r.verdict,
          ...(r.errorKind && { errorKind: r.errorKind }),
          timeMs: r.timeMs,
        })),
      };
    }

    await logAuditSafely(
      this.logger,
      this.auditService,
      AuditEventType.CODE_SUBMITTED,
      {
        attemptId: attempt.id,
        examId: attempt.examId,
        questionId: dto.questionId,
        submissionId: saved.id,
        mode: live ? 'LIVE' : 'DEFERRED',
        ...(result ? { passed: result.passed, total: result.total, score: result.score } : {}),
      },
      user.sub,
    );

    return {
      submissionId: saved.id,
      status: saved.status,
      savedAt: saved.createdAt.toISOString(),
      ...(result ? { result } : {}),
    };
  }
}
