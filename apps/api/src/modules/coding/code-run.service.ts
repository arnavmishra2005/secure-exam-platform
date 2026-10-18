/**
 * Owner: Person B.
 *
 * "Run" during an attempt: the student's code against their own stdin
 * (CUSTOM) or the problem's sample tests (SAMPLES). Never affects marks.
 */

import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CodeRunKind,
  CodeRunResponse,
  ExecutionOutcome,
  ExecutionStatus,
  SampleTestResult,
} from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { CodeRunDto } from '@secure-exam/validation';
import { EXECUTION_PROVIDER, ExecutionProvider } from '../execution/execution-provider.interface';
import { RunLimiterService } from '../execution/run-limiter.service';
import { ATTEMPT_ACCESS, IAttemptAccess } from './attempt-access/attempt-access.interface';
import { CodeRunEntity } from './entities/code-run.entity';
import { codingClientConfig } from './coding-config';
import { CodingQuestionResolver } from './coding-question.resolver';
import { verdictFor } from './grading/verdict';

@Injectable()
export class CodeRunService {
  private readonly logger = new Logger(CodeRunService.name);

  constructor(
    @Inject(ATTEMPT_ACCESS) private readonly attempts: IAttemptAccess,
    @Inject(EXECUTION_PROVIDER) private readonly executor: ExecutionProvider,
    private readonly limiter: RunLimiterService,
    private readonly resolver: CodingQuestionResolver,
    @InjectRepository(CodeRunEntity)
    private readonly runRepo: Repository<CodeRunEntity>,
    private readonly config: ConfigService,
  ) {}

  async run(attemptId: string, dto: CodeRunDto, user: JwtPayload): Promise<CodeRunResponse> {
    if (!codingClientConfig(this.config).serverRunEnabled) {
      // Decision log: in production, practice runs happen on the student's PC (CODING_SERVER_RUN).
      throw new ForbiddenException('Running code on the server is turned off; the exam app runs it on this computer');
    }
    const attempt = await this.attempts.assertWritable(attemptId, user);
    const { problem } = await this.resolver.resolveInExam(attempt.examId, dto.questionId);

    if (!problem.allowedLanguages.includes(dto.language)) {
      throw new BadRequestException(`${dto.language} is not allowed for this question`);
    }

    const samples =
      dto.kind === CodeRunKind.SAMPLES
        ? await this.resolver.sampleTests(dto.questionId)
        : [];
    if (dto.kind === CodeRunKind.SAMPLES && samples.length === 0) {
      throw new BadRequestException('This question has no sample tests');
    }

    const inputs = dto.kind === CodeRunKind.SAMPLES ? samples.map((t) => t.input) : [dto.stdin ?? ''];
    const outcomes = await this.limiter.run(user.sub, () =>
      this.executor.runBatch({
        language: dto.language,
        code: dto.code,
        inputs,
        limits: { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
      }),
    );

    let response: Omit<CodeRunResponse, 'runId'>;
    if (dto.kind === CodeRunKind.SAMPLES) {
      const results: SampleTestResult[] = samples.map((t, i) => ({
        index: i + 1,
        verdict: verdictFor(outcomes[i], t.expectedOutput, problem.comparisonMode),
        input: t.input,
        expectedOutput: t.expectedOutput,
        stdout: outcomes[i].stdout,
        stderr: outcomes[i].stderr,
        timeMs: outcomes[i].timeMs,
      }));
      response = { kind: dto.kind, samples: results };
    } else {
      response = { kind: dto.kind, outcome: outcomes[0] };
    }

    const runId = await this.record(attempt.id, user.sub, dto, outcomes, response);
    return { runId, ...response };
  }

  /** Best-effort trail of runs; a DB hiccup here must not lose the student's result. */
  private async record(
    attemptId: string,
    studentId: string,
    dto: CodeRunDto,
    outcomes: ExecutionOutcome[],
    response: Omit<CodeRunResponse, 'runId'>,
  ): Promise<string | null> {
    try {
      const failed = outcomes.find((o) => o.status !== ExecutionStatus.OK);
      const saved = await this.runRepo.save(
        this.runRepo.create({
          attemptId,
          questionId: dto.questionId,
          studentId,
          kind: dto.kind,
          language: dto.language,
          code: dto.code,
          stdin: dto.kind === CodeRunKind.CUSTOM ? dto.stdin ?? '' : null,
          status: failed?.status ?? ExecutionStatus.OK,
          stdout:
            dto.kind === CodeRunKind.CUSTOM
              ? outcomes[0].stdout
              : JSON.stringify(response.samples?.map((s) => s.verdict) ?? []),
          stderr: dto.kind === CodeRunKind.CUSTOM ? outcomes[0].stderr : failed?.stderr ?? '',
          timeMs: Math.max(...outcomes.map((o) => o.timeMs)),
        }),
      );
      return saved.id;
    } catch (err) {
      this.logger.error(`Failed to record code run for attempt ${attemptId}: ${(err as Error).message}`);
      return null;
    }
  }
}
