import { ConfigService } from '@nestjs/config';
import {
  CodeLanguage,
  CodeSubmissionStatus,
  ExecutionOutcome,
  ExecutionStatus,
  OutputComparisonMode,
} from '@secure-exam/types';
import { RunLimiterService } from '../execution/run-limiter.service';
import { CodeGradingService } from './code-grading.service';

const submittedAt = new Date('2026-10-16T10:00:00Z');
const item = {
  attemptId: 'att-1',
  examId: 'exam-1',
  studentId: 'student-1',
  questionId: 'q-1',
  submittedAt,
};
const ok = (stdout: string): ExecutionOutcome => ({
  status: ExecutionStatus.OK,
  stdout,
  stderr: '',
  exitCode: 0,
  timeMs: 5,
});

function setup() {
  const attempts = {
    findAwaitingCodeGrading: jest.fn().mockResolvedValue([item]),
    getDraftCode: jest.fn().mockResolvedValue(null),
  };
  const executor = { runBatch: jest.fn() };
  const scoreSink = { record: jest.fn().mockResolvedValue(undefined) };
  const resolver = {
    allTests: jest.fn().mockResolvedValue([
      { id: 't1', input: '1', expectedOutput: '1', weight: 1, isSample: true },
      { id: 't2', input: '2', expectedOutput: '4', weight: 3, isSample: false },
    ]),
  };
  const submissionRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const problemRepo = {
    findOne: jest.fn().mockResolvedValue({
      questionId: 'q-1',
      allowedLanguages: [CodeLanguage.PYTHON],
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      comparisonMode: OutputComparisonMode.TRIM,
    }),
  };
  const questionRepo = { findOne: jest.fn().mockResolvedValue({ id: 'q-1', marks: 8 }) };
  const txRepo = { update: jest.fn().mockResolvedValue({}), insert: jest.fn().mockResolvedValue({}) };
  const manager = { getRepository: jest.fn(() => txRepo) };
  const dataSource = { transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) => cb(manager)) };
  const auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };

  const service = new CodeGradingService(
    attempts as never,
    executor as never,
    scoreSink as never,
    new RunLimiterService(new ConfigService({})),
    resolver as never,
    submissionRepo as never,
    problemRepo as never,
    questionRepo as never,
    dataSource as never,
    auditService as never,
  );
  return { service, attempts, executor, scoreSink, submissionRepo, txRepo, dataSource, manager };
}

describe('CodeGradingService.gradeOne', () => {
  it('finalizes the last submit made before the attempt ended', async () => {
    const { service, submissionRepo, txRepo, scoreSink, executor, manager } = setup();
    submissionRepo.findOne.mockResolvedValue({ id: 'sub-9', score: 6 });

    await expect(service.gradeOne(item)).resolves.toBe('FROM_SUBMIT');

    const where = submissionRepo.findOne.mock.calls[0][0].where;
    expect(where).toMatchObject({ attemptId: 'att-1', questionId: 'q-1', isFinal: false, status: CodeSubmissionStatus.GRADED });
    expect(where.createdAt.value).toEqual(submittedAt); // LessThanOrEqual(submittedAt)
    expect(txRepo.update).toHaveBeenCalledWith({ id: 'sub-9' }, { isFinal: true });
    expect(scoreSink.record).toHaveBeenCalledWith(manager, expect.objectContaining({ score: 6, maxScore: 8 }));
    expect(executor.runBatch).not.toHaveBeenCalled();
  });

  it('grades the saved draft against all tests when there was no submit', async () => {
    const { service, attempts, executor, txRepo, scoreSink } = setup();
    attempts.getDraftCode.mockResolvedValue('print(int(input())**2)');
    executor.runBatch.mockResolvedValue([ok('1\n'), ok('4\n')]);

    await expect(service.gradeOne(item)).resolves.toBe('FROM_DRAFT');

    expect(executor.runBatch).toHaveBeenCalledWith(expect.objectContaining({ inputs: ['1', '2'] }));
    expect(txRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ isFinal: true, fromDraft: true, score: 8, passed: 2, total: 2 }),
    );
    expect(scoreSink.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ score: 8 }));
  });

  it('gives partial marks for a partly correct draft', async () => {
    const { service, attempts, executor, scoreSink } = setup();
    attempts.getDraftCode.mockResolvedValue('print(1)');
    executor.runBatch.mockResolvedValue([ok('1\n'), ok('1\n')]); // weight 1 of 4

    await service.gradeOne(item);
    expect(scoreSink.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ score: 2 }));
  });

  it('records 0 without running anything when there is no code', async () => {
    const { service, attempts, executor, txRepo, scoreSink } = setup();
    attempts.getDraftCode.mockResolvedValue('   \n');

    await expect(service.gradeOne(item)).resolves.toBe('NO_CODE');
    expect(executor.runBatch).not.toHaveBeenCalled();
    expect(txRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ isFinal: true, score: 0 }));
    expect(scoreSink.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ score: 0 }));
  });

  it('defers (writes nothing) when the sandbox fails', async () => {
    const { service, attempts, executor, dataSource } = setup();
    attempts.getDraftCode.mockResolvedValue('print(1)');
    executor.runBatch.mockResolvedValue([ok('1'), { ...ok(''), status: ExecutionStatus.INTERNAL_ERROR }]);

    await expect(service.gradeOne(item)).resolves.toBe('DEFERRED');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('treats a unique-index clash as already graded', async () => {
    const { service, submissionRepo, dataSource } = setup();
    submissionRepo.findOne.mockResolvedValue({ id: 'sub-9', score: 6 });
    dataSource.transaction.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

    await expect(service.gradeOne(item)).resolves.toBe('ALREADY_GRADED');
  });
});

describe('CodeGradingService.sweep', () => {
  it('keeps going after one item fails', async () => {
    const { service, attempts, submissionRepo, scoreSink } = setup();
    attempts.findAwaitingCodeGrading.mockResolvedValue([item, { ...item, attemptId: 'att-2' }]);
    submissionRepo.findOne
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ id: 'sub-2', score: 3 });

    await service.sweep();

    expect(scoreSink.record).toHaveBeenCalledTimes(1);
    expect(scoreSink.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ attemptId: 'att-2' }));
  });
});
