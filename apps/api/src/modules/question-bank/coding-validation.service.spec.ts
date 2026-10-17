import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionStatus, OutputComparisonMode, TestCaseVerdict, type ExecutionOutcome } from '@secure-exam/types';
import { RunLimiterService } from '../execution/run-limiter.service';
import { CodingValidationService } from './coding-validation.service';

const ok = (stdout: string, timeMs = 100): ExecutionOutcome => ({
  status: ExecutionStatus.OK,
  stdout,
  stderr: '',
  exitCode: 0,
  timeMs,
});

function setup() {
  const executor = { runBatch: jest.fn() };
  const service = new CodingValidationService(executor as never, new RunLimiterService(new ConfigService({})));
  return { service, executor };
}

const coding = {
  statementMd: 'Square',
  timeLimitMs: 1000,
  comparisonMode: OutputComparisonMode.TRIM,
  referenceSolution: 'print(int(input())**2)',
  tests: [
    { input: '2', expectedOutput: '4', isSample: true },
    { input: '3', expectedOutput: '10', isSample: false }, // author typo
  ],
};

describe('CodingValidationService', () => {
  it('runs the reference solution and reports which tests disagree', async () => {
    const { service, executor } = setup();
    executor.runBatch.mockResolvedValue([ok('4\n', 120), ok('9\n', 800)]);

    const res = await service.validate({ coding }, 'admin-1');

    expect(executor.runBatch).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'print(int(input())**2)', inputs: ['2', '3'], limits: { timeLimitMs: 1000, memoryLimitMb: 256 } }),
    );
    expect(res).toMatchObject({ ok: false, passed: 1, total: 2, slowestShareOfLimit: 0.8 });
    expect(res.tests[1]).toMatchObject({ index: 2, isSample: false, verdict: TestCaseVerdict.WRONG_ANSWER, expectedOutput: '10', stdout: '9\n' });
  });

  it('runs explicit code instead of the reference solution', async () => {
    const { service, executor } = setup();
    executor.runBatch.mockResolvedValue([ok('4'), ok('10')]);
    const res = await service.validate({ coding, code: 'print("other")' }, 'admin-1');
    expect(executor.runBatch.mock.calls[0][0].code).toBe('print("other")');
    expect(res.ok).toBe(true);
  });

  it('needs some code', async () => {
    const { service, executor } = setup();
    await expect(service.validate({ coding: { ...coding, referenceSolution: '  ' } }, 'a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(executor.runBatch).not.toHaveBeenCalled();
  });

  it('reports a sandbox failure as 503, not as failing tests', async () => {
    const { service, executor } = setup();
    executor.runBatch.mockResolvedValue([ok('4'), { ...ok(''), status: ExecutionStatus.INTERNAL_ERROR }]);
    await expect(service.validate({ coding }, 'a')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
