/**
 * Owner: Person B. Pure functions: output comparison and verdicts.
 */

import { ExecutionOutcome, ExecutionStatus, OutputComparisonMode, TestCaseVerdict } from '@secure-exam/types';

/** Normalizes Windows line endings so authors' test files from any OS compare cleanly. */
function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n');
}

export function outputsMatch(mode: OutputComparisonMode, expected: string, actual: string): boolean {
  const e = normalizeNewlines(expected);
  const a = normalizeNewlines(actual);
  switch (mode) {
    case OutputComparisonMode.EXACT:
      return e === a;
    case OutputComparisonMode.TOKENS: {
      const tokens = (s: string) => s.split(/\s+/).filter(Boolean);
      const et = tokens(e);
      const at = tokens(a);
      return et.length === at.length && et.every((t, i) => t === at[i]);
    }
    case OutputComparisonMode.TRIM:
    default: {
      const trim = (s: string) =>
        s
          .split('\n')
          .map((line) => line.replace(/\s+$/, ''))
          .join('\n')
          .replace(/\n+$/, '');
      return trim(e) === trim(a);
    }
  }
}

const STATUS_TO_VERDICT: Record<ExecutionStatus, TestCaseVerdict> = {
  [ExecutionStatus.OK]: TestCaseVerdict.PASSED, // refined by comparison below
  [ExecutionStatus.RUNTIME_ERROR]: TestCaseVerdict.RUNTIME_ERROR,
  [ExecutionStatus.TIME_LIMIT_EXCEEDED]: TestCaseVerdict.TIME_LIMIT_EXCEEDED,
  [ExecutionStatus.MEMORY_LIMIT_EXCEEDED]: TestCaseVerdict.MEMORY_LIMIT_EXCEEDED,
  [ExecutionStatus.OUTPUT_LIMIT_EXCEEDED]: TestCaseVerdict.OUTPUT_LIMIT_EXCEEDED,
  [ExecutionStatus.INTERNAL_ERROR]: TestCaseVerdict.INTERNAL_ERROR,
};

export function verdictFor(
  outcome: ExecutionOutcome,
  expectedOutput: string,
  mode: OutputComparisonMode,
): TestCaseVerdict {
  if (outcome.status !== ExecutionStatus.OK) return STATUS_TO_VERDICT[outcome.status];
  return outputsMatch(mode, expectedOutput, outcome.stdout)
    ? TestCaseVerdict.PASSED
    : TestCaseVerdict.WRONG_ANSWER;
}
