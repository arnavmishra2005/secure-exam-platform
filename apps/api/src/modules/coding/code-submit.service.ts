/**
 * Owner: Person B.
 *
 * "Submit" during an attempt: runs the code against ALL test cases (samples
 * and hidden) and stores a graded, not-yet-final CodeSubmission. The last
 * one made before the attempt ends becomes final at grading time
 * (CodeGradingService). Students see verdicts only, never hidden inputs or
 * expected outputs.
 */

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditEventType,
  CodeSubmissionStatus,
  CodeSubmitResponse,
} from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { CodeSubmitDto } from '@secure-exam/validation';
import { AuditService } from '../audit/audit.service';
import { logAuditSafely } from '../attempt/audit-safe.util';
import { EXECUTION_PROVIDER, ExecutionProvider } from '../execution/execution-provider.interface';
import { RunLimiterService } from '../execution/run-limiter.service';
import { ATTEMPT_ACCESS, IAttemptAccess } from './attempt-access/attempt-access.interface';
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
  ) {}

  async submit(attemptId: string, dto: CodeSubmitDto, user: JwtPayload): Promise<CodeSubmitResponse> {
    const attempt = await this.attempts.assertWritable(attemptId, user);
    const { question, problem } = await this.resolver.resolveInExam(attempt.examId, dto.questionId);
    if (!problem.allowedLanguages.includes(dto.language)) {
      throw new BadRequestException(`${dto.language} is not allowed for this question`);
    }

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
    } catch {
      throw new ConflictException(
        'The attempt ended before your submission finished, so it was not counted',
      );
    }

    const saved = await this.submissionRepo.save(
      this.submissionRepo.create({
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
      }),
    );

    await logAuditSafely(
      this.logger,
      this.auditService,
      AuditEventType.CODE_SUBMITTED,
      {
        attemptId: attempt.id,
        examId: attempt.examId,
        questionId: dto.questionId,
        submissionId: saved.id,
        passed: evaluation.passed,
        total: evaluation.total,
        score: evaluation.score,
      },
      user.sub,
    );

    return {
      submissionId: saved.id,
      status: saved.status,
      passed: evaluation.passed,
      total: evaluation.total,
      score: evaluation.score,
      maxScore: evaluation.maxScore,
      tests: evaluation.results.map((r, i) => ({
        index: i + 1,
        isSample: tests[i].isSample,
        verdict: r.verdict,
        timeMs: r.timeMs,
      })),
    };
  }
}
