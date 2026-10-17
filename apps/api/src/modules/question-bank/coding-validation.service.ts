/**
 * Owner: Person B.
 *
 * Runs an author's reference solution (or any code) against a coding
 * problem's tests before the problem is saved or used, so wrong expected
 * outputs and too-tight time limits are caught early. Shares the sandbox
 * and the run limiter with students (keyed by the admin's user id).
 */

import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CodeLanguage, OutputComparisonMode, type ValidateCodingResponse } from '@secure-exam/types';
import type { ValidateCodingDto } from '@secure-exam/validation';
import { evaluate } from '../coding/grading/evaluate';
import { EXECUTION_PROVIDER, ExecutionProvider } from '../execution/execution-provider.interface';
import { RunLimiterService } from '../execution/run-limiter.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class CodingValidationService {
  constructor(
    @Inject(EXECUTION_PROVIDER) private readonly executor: ExecutionProvider,
    private readonly limiter: RunLimiterService,
  ) {}

  async validate(dto: ValidateCodingDto, actorId: string): Promise<ValidateCodingResponse> {
    const code = dto.code ?? dto.coding.referenceSolution ?? '';
    if (!code.trim()) throw new BadRequestException('Add a reference solution (or code to test) first');

    const timeLimitMs = dto.coding.timeLimitMs ?? 2000;
    const tests = dto.coding.tests.map((t, i) => ({
      id: String(i),
      input: t.input,
      expectedOutput: t.expectedOutput,
      weight: t.weight ?? 1,
      isSample: t.isSample,
    }));

    const outcomes = await this.limiter.run(actorId, () =>
      this.executor.runBatch({
        language: CodeLanguage.PYTHON,
        code,
        inputs: tests.map((t) => t.input),
        limits: { timeLimitMs, memoryLimitMb: dto.coding.memoryLimitMb ?? 256 },
      }),
    );
    // Marks don't matter here; use 1 so `passed` / `total` are what count.
    const evaluation = evaluate(tests, outcomes, dto.coding.comparisonMode ?? OutputComparisonMode.TRIM, 1);
    if (!evaluation.sandboxOk) {
      throw new ServiceUnavailableException('The code runner is unavailable. Try again in a moment');
    }

    return {
      ok: evaluation.passed === evaluation.total,
      passed: evaluation.passed,
      total: evaluation.total,
      slowestShareOfLimit: round2(Math.max(...outcomes.map((o) => o.timeMs)) / timeLimitMs),
      tests: evaluation.results.map((r, i) => ({
        index: i + 1,
        isSample: tests[i].isSample,
        verdict: r.verdict,
        timeMs: r.timeMs,
        expectedOutput: tests[i].expectedOutput,
        stdout: r.stdout,
        stderr: r.stderr,
      })),
    };
  }
}
