/**
 * Owner: Person B.
 *
 * "Run" during an attempt: the student's code against their own stdin
 * (CUSTOM) or the problem's sample tests (SAMPLES). Never affects marks.
 */

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CodeRunKind,
  CodeRunResponse,
  ExecutionOutcome,
  ExecutionStatus,
  QuestionType,
  SampleTestResult,
} from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { CodeRunDto } from '@secure-exam/validation';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { EXECUTION_PROVIDER, ExecutionProvider } from '../execution/execution-provider.interface';
import { RunLimiterService } from '../execution/run-limiter.service';
import { ATTEMPT_ACCESS, IAttemptAccess } from './attempt-access/attempt-access.interface';
import { CodeRunEntity } from './entities/code-run.entity';
import { CodingProblemEntity } from './entities/coding-problem.entity';
import { CodingTestCaseEntity } from './entities/coding-test-case.entity';
import { verdictFor } from './grading/verdict';

@Injectable()
export class CodeRunService {
  private readonly logger = new Logger(CodeRunService.name);

  constructor(
    @Inject(ATTEMPT_ACCESS) private readonly attempts: IAttemptAccess,
    @Inject(EXECUTION_PROVIDER) private readonly executor: ExecutionProvider,
    private readonly limiter: RunLimiterService,
    @InjectRepository(ExamQuestionEntity)
    private readonly examQuestionRepo: Repository<ExamQuestionEntity>,
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(CodingProblemEntity)
    private readonly problemRepo: Repository<CodingProblemEntity>,
    @InjectRepository(CodingTestCaseEntity)
    private readonly testCaseRepo: Repository<CodingTestCaseEntity>,
    @InjectRepository(CodeRunEntity)
    private readonly runRepo: Repository<CodeRunEntity>,
  ) {}

  async run(attemptId: string, dto: CodeRunDto, user: JwtPayload): Promise<CodeRunResponse> {
    const attempt = await this.attempts.assertWritable(attemptId, user);
    const problem = await this.getProblemForExam(attempt.examId, dto.questionId);

    if (!problem.allowedLanguages.includes(dto.language)) {
      throw new BadRequestException(`${dto.language} is not allowed for this question`);
    }

    const samples =
      dto.kind === CodeRunKind.SAMPLES
        ? await this.testCaseRepo.find({
            where: { questionId: dto.questionId, isSample: true },
            order: { order: 'ASC' },
          })
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

  /**
   * The CODING question's problem, but only if the question is part of the
   * attempt's exam. Same 400 wording as saving an answer to a foreign question.
   */
  private async getProblemForExam(examId: string, questionId: string): Promise<CodingProblemEntity> {
    const inExam = await this.examQuestionRepo.exist({ where: { examId, questionId } });
    if (!inExam) {
      throw new BadRequestException("This question does not belong to the attempt's exam");
    }
    const question = await this.questionRepo.findOne({ where: { id: questionId } });
    if (!question || question.type !== QuestionType.CODING) {
      throw new BadRequestException('This is not a coding question');
    }
    const problem = await this.problemRepo.findOne({ where: { questionId } });
    if (!problem) {
      throw new ConflictException('This coding question has not been set up yet');
    }
    return problem;
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
