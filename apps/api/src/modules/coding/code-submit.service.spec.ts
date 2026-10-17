import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeLanguage,
  ExecutionOutcome,
  ExecutionStatus,
  OutputComparisonMode,
  QuestionType,
  Role,
  TestCaseVerdict,
} from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { RunLimiterService } from '../execution/run-limiter.service';
import { CodeSubmitService } from './code-submit.service';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const QUESTION_ID = '33333333-3333-4333-8333-333333333333';
const student = { sub: 'student-1', role: Role.STUDENT } as JwtPayload;

const ok = (stdout: string): ExecutionOutcome => ({
  status: ExecutionStatus.OK,
  stdout,
  stderr: '',
  exitCode: 0,
  timeMs: 10,
});

function setup() {
  const attempts = {
    assertWritable: jest.fn().mockResolvedValue({ id: ATTEMPT_ID, examId: 'exam-1', studentId: 'student-1' }),
  };
  const executor = { runBatch: jest.fn() };
  const resolver = {
    resolveInExam: jest.fn().mockResolvedValue({
      question: { id: QUESTION_ID, type: QuestionType.CODING, marks: 10 },
      problem: {
        allowedLanguages: [CodeLanguage.PYTHON],
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        comparisonMode: OutputComparisonMode.TRIM,
      },
    }),
    allTests: jest.fn().mockResolvedValue([
      { id: 't1', input: '1 2', expectedOutput: '3', weight: 1, isSample: true },
      { id: 't2', input: 'SECRET-IN', expectedOutput: 'SECRET-OUT', weight: 1, isSample: false },
      { id: 't3', input: '5 5', expectedOutput: '10', weight: 2, isSample: false },
    ]),
  };
  const submissionRepo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: 'sub-1' })),
  };
  const auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new CodeSubmitService(
    attempts as never,
    executor as never,
    new RunLimiterService(new ConfigService({})),
    resolver as never,
    submissionRepo as never,
    auditService as never,
  );
  return { service, attempts, executor, submissionRepo };
}

const dto = { questionId: QUESTION_ID, language: CodeLanguage.PYTHON, code: 'print(1)' };

describe('CodeSubmitService.submit', () => {
  it('grades against all tests with partial marks and stores a non-final submission', async () => {
    const { service, executor, submissionRepo } = setup();
    executor.runBatch.mockResolvedValue([ok('3\n'), ok('wrong\n'), ok('10\n')]);

    const res = await service.submit(ATTEMPT_ID, dto, student);

    expect(executor.runBatch).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: ['1 2', 'SECRET-IN', '5 5'] }),
    );
    // weights 1 + 2 passed out of 4 → 7.5 / 10
    expect(res).toMatchObject({ submissionId: 'sub-1', passed: 2, total: 3, score: 7.5, maxScore: 10 });
    expect(res.tests).toEqual([
      { index: 1, isSample: true, verdict: TestCaseVerdict.PASSED, timeMs: 10 },
      { index: 2, isSample: false, verdict: TestCaseVerdict.WRONG_ANSWER, timeMs: 10 },
      { index: 3, isSample: false, verdict: TestCaseVerdict.PASSED, timeMs: 10 },
    ]);
    expect(JSON.stringify(res)).not.toMatch(/SECRET/);
    expect(submissionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isFinal: false, fromDraft: false, score: 7.5, studentId: 'student-1' }),
    );
  });

  it('does not store anything when the sandbox fails', async () => {
    const { service, executor, submissionRepo } = setup();
    executor.runBatch.mockResolvedValue([
      ok('3\n'),
      { ...ok(''), status: ExecutionStatus.INTERNAL_ERROR },
      ok('10\n'),
    ]);
    await expect(service.submit(ATTEMPT_ID, dto, student)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(submissionRepo.save).not.toHaveBeenCalled();
  });

  it('does not count a submit that finishes after the attempt ended', async () => {
    const { service, attempts, executor, submissionRepo } = setup();
    executor.runBatch.mockResolvedValue([ok('3'), ok('x'), ok('10')]);
    attempts.assertWritable
      .mockResolvedValueOnce({ id: ATTEMPT_ID, examId: 'exam-1', studentId: 'student-1' })
      .mockRejectedValueOnce(new ConflictException('This attempt has already been submitted'));

    await expect(service.submit(ATTEMPT_ID, dto, student)).rejects.toThrow('was not counted');
    expect(submissionRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a question with no test cases', async () => {
    const { service, executor } = setup();
    (service as unknown as { resolver: { allTests: jest.Mock } }).resolver.allTests.mockResolvedValue([]);
    await expect(service.submit(ATTEMPT_ID, dto, student)).rejects.toBeInstanceOf(ConflictException);
    expect(executor.runBatch).not.toHaveBeenCalled();
  });
});
