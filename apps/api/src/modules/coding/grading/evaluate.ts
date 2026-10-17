/**
 * Owner: Person B. Turns raw execution outcomes into per-test results + score.
 */

import {
  ExecutionOutcome,
  ExecutionStatus,
  OutputComparisonMode,
  StoredTestResult,
} from '@secure-exam/types';
import { CodeScore, scoreTests } from './scoring';
import { verdictFor } from './verdict';

/** Stored output per test is trimmed further than the runner's cap to keep rows small. */
const STORED_OUTPUT_CHARS = 4096;

export interface TestCaseLike {
  id: string;
  expectedOutput: string;
  weight: number;
  isSample: boolean;
}

export interface Evaluation extends CodeScore {
  /** False if the sandbox failed on any test: the result must not count. */
  sandboxOk: boolean;
  results: StoredTestResult[];
}

export function evaluate(
  tests: TestCaseLike[],
  outcomes: ExecutionOutcome[],
  mode: OutputComparisonMode,
  marks: number,
): Evaluation {
  const results: StoredTestResult[] = tests.map((t, i) => ({
    testCaseId: t.id,
    verdict: verdictFor(outcomes[i], t.expectedOutput, mode),
    weight: t.weight,
    stdout: outcomes[i].stdout.slice(0, STORED_OUTPUT_CHARS),
    stderr: outcomes[i].stderr.slice(0, STORED_OUTPUT_CHARS),
    timeMs: outcomes[i].timeMs,
  }));
  return {
    sandboxOk: outcomes.every((o) => o.status !== ExecutionStatus.INTERNAL_ERROR),
    results,
    ...scoreTests(marks, results),
  };
}
