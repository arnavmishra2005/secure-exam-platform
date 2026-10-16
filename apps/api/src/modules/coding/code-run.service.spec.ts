import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeLanguage,
  CodeRunKind,
  ExecutionOutcome,
  ExecutionStatus,
  OutputComparisonMode,
  QuestionType,
  Role,
  TestCaseVerdict,
} from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { RunLimiterService } from '../execution/run-limiter.service';
import { CodeRunService } from './code-run.service';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const EXAM_ID = '22222222-2222-4222-8222-222222222222';
const QUESTION_ID = '33333333-3333-4333-8333-333333333333';
const student: JwtPayload = { sub: 'student-1', email: 's@x.dev', role: Role.STUDENT } as JwtPayload;

const ok = (stdout: string): ExecutionOutcome => ({
  status: ExecutionStatus.OK,
  stdout,
  stderr: '',
  exitCode: 0,
  timeMs: 12,
});

function setup(overrides: { inExam?: boolean; type?: QuestionType; problem?: object | null } = {}) {
  const attempts = {
    assertWritable: jest.fn().mockResolvedValue({ id: ATTEMPT_ID, examId: EXAM_ID, studentId: 'student-1' }),
  };
  const executor = { runBatch: jest.fn() };
  const examQuestionRepo = { exist: jest.fn().mockResolvedValue(overrides.inExam ?? true) };
  const questionRepo = {
    findOne: jest.fn().mockResolvedValue({ id: QUESTION_ID, type: overrides.type ?? QuestionType.CODING }),
  };
  const problem =
    overrides.problem === undefined
      ? {
          questionId: QUESTION_ID,
          allowedLanguages: [CodeLanguage.PYTHON],
          timeLimitMs: 2000,
          memoryLimitMb: 256,
          comparisonMode: OutputComparisonMode.TRIM,
        }
      : overrides.problem;
  const problemRepo = { findOne: jest.fn().mockResolvedValue(problem) };
  const testCaseRepo = {
    find: jest.fn().mockResolvedValue([
      { input: '1 2', expectedOutput: '3', isSample: true },
      { input: '5 5', expectedOutput: '10', isSample: true },
    ]),
  };
  const runRepo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: 'run-1' })),
  };
  const service = new CodeRunService(
    attempts,
    executor,
    new RunLimiterService(new ConfigService({})),
    examQuestionRepo as never,
    questionRepo as never,
    problemRepo as never,
    testCaseRepo as never,
    runRepo as never,
  );
  return { service, attempts, executor, testCaseRepo, runRepo, examQuestionRepo };
}

const dto = (kind: CodeRunKind, extra: object = {}) => ({
  questionId: QUESTION_ID,
  language: CodeLanguage.PYTHON,
  code: 'print(sum(map(int, input().split())))',
  kind,
  ...extra,
});

describe('CodeRunService.run', () => {
  it('runs custom stdin once and returns the raw outcome', async () => {
    const { service, executor, runRepo } = setup();
    executor.runBatch.mockResolvedValue([ok('7\n')]);

    const res = await service.run(ATTEMPT_ID, dto(CodeRunKind.CUSTOM, { stdin: '3 4' }), student);

    expect(executor.runBatch).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: ['3 4'], limits: { timeLimitMs: 2000, memoryLimitMb: 256 } }),
    );
    expect(res).toEqual({ runId: 'run-1', kind: CodeRunKind.CUSTOM, outcome: ok('7\n') });
    expect(runRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 'student-1', stdin: '3 4', status: ExecutionStatus.OK }),
    );
  });

  it('runs only sample tests and gives a verdict per sample', async () => {
    const { service, executor, testCaseRepo } = setup();
    executor.runBatch.mockResolvedValue([ok('3\n'), ok('11\n')]);

    const res = await service.run(ATTEMPT_ID, dto(CodeRunKind.SAMPLES), student);

    expect(testCaseRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { questionId: QUESTION_ID, isSample: true } }),
    );
    expect(executor.runBatch).toHaveBeenCalledWith(expect.objectContaining({ inputs: ['1 2', '5 5'] }));
    expect(res.samples?.map((s) => [s.index, s.verdict])).toEqual([
      [1, TestCaseVerdict.PASSED],
      [2, TestCaseVerdict.WRONG_ANSWER],
    ]);
  });

  it('checks attempt ownership/status before anything else', async () => {
    const { service, attempts, executor } = setup();
    attempts.assertWritable.mockRejectedValue(new ConflictException('This attempt has already been submitted'));
    await expect(service.run(ATTEMPT_ID, dto(CodeRunKind.CUSTOM), student)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(executor.runBatch).not.toHaveBeenCalled();
  });

  it("rejects a question that isn't in the attempt's exam", async () => {
    const { service, executor } = setup({ inExam: false });
    await expect(service.run(ATTEMPT_ID, dto(CodeRunKind.CUSTOM), student)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(executor.runBatch).not.toHaveBeenCalled();
  });

  it('rejects a non-coding question', async () => {
    const { service } = setup({ type: QuestionType.MCQ_SINGLE });
    await expect(service.run(ATTEMPT_ID, dto(CodeRunKind.CUSTOM), student)).rejects.toThrow(
      'This is not a coding question',
    );
  });

  it('returns 409 when the coding problem was never set up', async () => {
    const { service } = setup({ problem: null });
    await expect(service.run(ATTEMPT_ID, dto(CodeRunKind.CUSTOM), student)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects SAMPLES when the question has no sample tests', async () => {
    const { service, testCaseRepo, executor } = setup();
    testCaseRepo.find.mockResolvedValue([]);
    await expect(service.run(ATTEMPT_ID, dto(CodeRunKind.SAMPLES), student)).rejects.toThrow(
      'This question has no sample tests',
    );
    expect(executor.runBatch).not.toHaveBeenCalled();
  });

  it('still returns the result when recording the run fails', async () => {
    const { service, executor, runRepo } = setup();
    executor.runBatch.mockResolvedValue([ok('7\n')]);
    runRepo.save.mockRejectedValue(new Error('db down'));
    const res = await service.run(ATTEMPT_ID, dto(CodeRunKind.CUSTOM, { stdin: '3 4' }), student);
    expect(res.runId).toBeNull();
    expect(res.outcome?.stdout).toBe('7\n');
  });
});
