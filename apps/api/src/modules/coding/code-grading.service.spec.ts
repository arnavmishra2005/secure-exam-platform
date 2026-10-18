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

const submittedAt = new Date('2026-10-17T10:00:00Z');
const item = { attemptId: 'att-1', examId: 'exam-1', studentId: 'student-1', questionId: 'q-1', submittedAt };
const ok = (stdout: string): ExecutionOutcome => ({ status: ExecutionStatus.OK, stdout, stderr: '', exitCode: 0, timeMs: 5 });

function setup() {
  const attempts = {
    findAwaitingCodeGrading: jest.fn().mockResolvedValue([item]),
    getDraftCode: jest.fn().mockResolvedValue(null),
    getFinishedAttempt: jest.fn().mockResolvedValue({ attemptId: 'att-1', examId: 'exam-1', studentId: 'student-1', submittedAt }),
  };
  const executor = { runBatch: jest.fn() };
  const scoreSink = { record: jest.fn().mockResolvedValue(undefined), replaceTotals: jest.fn() };
  const resolver = {
    allTests: jest.fn().mockResolvedValue([
      { id: 't1', input: '1', expectedOutput: '1', weight: 1, isSample: true },
      { id: 't2', input: '2', expectedOutput: '4', weight: 3, isSample: false },
    ]),
  };
  const totals = { recompute: jest.fn().mockResolvedValue(undefined) };
  const submissionRepo = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) };
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
  const txRepo = {
    update: jest.fn().mockResolvedValue({}),
    insert: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  };
  const manager = { getRepository: jest.fn(() => txRepo) };
  const dataSource = { transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) => cb(manager)) };
  const auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };

  const service = new CodeGradingService(
    attempts as never,
    executor as never,
    scoreSink as never,
    new RunLimiterService(new ConfigService({})),
    resolver as never,
    totals as never,
    submissionRepo as never,
    problemRepo as never,
    questionRepo as never,
    dataSource as never,
    auditService as never,
  );
  return { service, attempts, executor, scoreSink, submissionRepo, txRepo, dataSource, manager, totals };
}

describe('CodeGradingService.gradeOne', () => {
  it('runs a saved (PENDING) Submit against all tests and makes it final', async () => {
    const { service, submissionRepo, executor, txRepo, scoreSink, manager } = setup();
    submissionRepo.findOne.mockResolvedValue({
      id: 'sub-9',
      questionId: 'q-1',
      status: CodeSubmissionStatus.PENDING,
      code: 'print(int(input())**2)',
    });
    executor.runBatch.mockResolvedValue([ok('1\n'), ok('4\n')]);

    await expect(service.gradeOne(item)).resolves.toBe('FROM_SUBMIT');

    const where = submissionRepo.findOne.mock.calls[0][0].where;
    expect(where).toMatchObject({ attemptId: 'att-1', questionId: 'q-1', isFinal: false });
    expect(where.createdAt.value).toEqual(submittedAt); // only submits made before the attempt ended
    expect(executor.runBatch).toHaveBeenCalledWith(expect.objectContaining({ code: 'print(int(input())**2)', inputs: ['1', '2'] }));
    expect(txRepo.update).toHaveBeenCalledWith(
      { id: 'sub-9' },
      expect.objectContaining({ status: CodeSubmissionStatus.GRADED, isFinal: true, score: 8, passed: 2, total: 2 }),
    );
    expect(scoreSink.record).toHaveBeenCalledWith(manager, expect.objectContaining({ score: 8, maxScore: 8 }));
    // Earlier ungraded Submits are marked as replaced.
    expect(txRepo.update).toHaveBeenCalledWith(
      { attemptId: 'att-1', questionId: 'q-1', isFinal: false, status: CodeSubmissionStatus.PENDING },
      { status: CodeSubmissionStatus.SUPERSEDED },
    );
  });

  it('reuses an already GRADED Submit (live mode) without running again', async () => {
    const { service, submissionRepo, executor, txRepo, scoreSink } = setup();
    submissionRepo.findOne.mockResolvedValue({ id: 'sub-9', status: CodeSubmissionStatus.GRADED, score: 6 });
    await expect(service.gradeOne(item)).resolves.toBe('FROM_SUBMIT');
    expect(executor.runBatch).not.toHaveBeenCalled();
    expect(txRepo.update).toHaveBeenCalledWith({ id: 'sub-9' }, { isFinal: true });
    expect(scoreSink.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ score: 6 }));
  });

  it('grades the saved draft when there was no Submit, with partial marks', async () => {
    const { service, attempts, executor, txRepo, scoreSink } = setup();
    attempts.getDraftCode.mockResolvedValue('print(1)');
    executor.runBatch.mockResolvedValue([ok('1\n'), ok('1\n')]); // weight 1 of 4

    await expect(service.gradeOne(item)).resolves.toBe('FROM_DRAFT');
    expect(txRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ isFinal: true, fromDraft: true, score: 2 }));
    expect(scoreSink.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ score: 2 }));
  });

  it('records 0 without running anything when there is no code', async () => {
    const { service, attempts, executor, txRepo } = setup();
    attempts.getDraftCode.mockResolvedValue('   ');
    await expect(service.gradeOne(item)).resolves.toBe('NO_CODE');
    expect(executor.runBatch).not.toHaveBeenCalled();
    expect(txRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ isFinal: true, score: 0 }));
  });

  it('leaves the work for later when the sandbox fails', async () => {
    const { service, submissionRepo, executor, dataSource } = setup();
    submissionRepo.findOne.mockResolvedValue({ id: 's', questionId: 'q-1', status: CodeSubmissionStatus.PENDING, code: 'x' });
    executor.runBatch.mockResolvedValue([ok('1'), { ...ok(''), status: ExecutionStatus.INTERNAL_ERROR }]);
    await expect(service.gradeOne(item)).resolves.toBe('DEFERRED');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('treats a unique-index clash as already graded', async () => {
    const { service, submissionRepo, dataSource } = setup();
    submissionRepo.findOne.mockResolvedValue({ id: 'sub-9', status: CodeSubmissionStatus.GRADED, score: 6 });
    dataSource.transaction.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(service.gradeOne(item)).resolves.toBe('ALREADY_GRADED');
  });
});

describe('CodeGradingService.rerunFinal', () => {
  const queued = {
    id: 'fin-1',
    attemptId: 'att-1',
    questionId: 'q-1',
    studentId: 'student-1',
    status: CodeSubmissionStatus.PENDING,
    isFinal: true,
    code: 'print(int(input())**2)',
  };

  it('reruns the final code and recomputes the total once nothing else is queued', async () => {
    const { service, executor, txRepo, totals, manager } = setup();
    executor.runBatch.mockResolvedValue([ok('1\n'), ok('4\n')]);

    await expect(service.rerunFinal(queued as never)).resolves.toBe('REGRADED');
    expect(txRepo.update).toHaveBeenCalledWith(
      { id: 'fin-1', status: CodeSubmissionStatus.PENDING },
      expect.objectContaining({ status: CodeSubmissionStatus.GRADED, score: 8 }),
    );
    expect(totals.recompute).toHaveBeenCalledWith(manager, 'exam-1', 'att-1');
  });

  it('waits to recompute while other answers of the attempt are still queued', async () => {
    const { service, executor, txRepo, totals } = setup();
    executor.runBatch.mockResolvedValue([ok('1\n'), ok('4\n')]);
    txRepo.count.mockResolvedValue(1);
    await service.rerunFinal(queued as never);
    expect(totals.recompute).not.toHaveBeenCalled();
  });
});

describe('CodeGradingService.sweep', () => {
  it('grades new attempts, then reruns queued answers, and keeps going after a failure', async () => {
    const { service, attempts, submissionRepo, scoreSink, executor } = setup();
    attempts.findAwaitingCodeGrading.mockResolvedValue([item, { ...item, attemptId: 'att-2' }]);
    submissionRepo.findOne
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ id: 'sub-2', status: CodeSubmissionStatus.GRADED, score: 3 });
    submissionRepo.find.mockResolvedValue([
      { id: 'fin-1', attemptId: 'att-3', questionId: 'q-1', studentId: 's', status: CodeSubmissionStatus.PENDING, isFinal: true, code: 'x' },
    ]);
    executor.runBatch.mockResolvedValue([ok('1'), ok('4')]);

    await service.sweep();

    expect(scoreSink.record).toHaveBeenCalledTimes(1);
    expect(submissionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isFinal: true, status: CodeSubmissionStatus.PENDING } }),
    );
    expect(executor.runBatch).toHaveBeenCalledTimes(1); // the queued rerun
  });
});
