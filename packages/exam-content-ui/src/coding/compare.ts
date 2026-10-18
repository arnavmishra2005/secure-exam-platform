/**
 * Owner: Person B. Client copy of the server's output comparison
 * (apps/api/src/modules/coding/grading/verdict.ts) so a sample that passes
 * on the student's PC also passes when the server grades it. Keep the two in sync.
 */
import { ExecutionStatus, OutputComparisonMode, TestCaseVerdict, type ExecutionOutcome } from '@secure-exam/types';

const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, '\n');

export function outputsMatch(mode: OutputComparisonMode, expected: string, actual: string): boolean {
  const e = normalizeNewlines(expected);
  const a = normalizeNewlines(actual);
  if (mode === OutputComparisonMode.EXACT) return e === a;
  if (mode === OutputComparisonMode.TOKENS) {
    const tokens = (s: string) => s.split(/\s+/).filter(Boolean);
    const et = tokens(e);
    const at = tokens(a);
    return et.length === at.length && et.every((t, i) => t === at[i]);
  }
  const trim = (s: string) =>
    s
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');
  return trim(e) === trim(a);
}

const STATUS_TO_VERDICT: Record<ExecutionStatus, TestCaseVerdict> = {
  [ExecutionStatus.OK]: TestCaseVerdict.PASSED,
  [ExecutionStatus.RUNTIME_ERROR]: TestCaseVerdict.RUNTIME_ERROR,
  [ExecutionStatus.TIME_LIMIT_EXCEEDED]: TestCaseVerdict.TIME_LIMIT_EXCEEDED,
  [ExecutionStatus.MEMORY_LIMIT_EXCEEDED]: TestCaseVerdict.MEMORY_LIMIT_EXCEEDED,
  [ExecutionStatus.OUTPUT_LIMIT_EXCEEDED]: TestCaseVerdict.OUTPUT_LIMIT_EXCEEDED,
  [ExecutionStatus.INTERNAL_ERROR]: TestCaseVerdict.INTERNAL_ERROR,
};

export function verdictFor(outcome: ExecutionOutcome, expected: string, mode: OutputComparisonMode): TestCaseVerdict {
  if (outcome.status !== ExecutionStatus.OK) return STATUS_TO_VERDICT[outcome.status];
  return outputsMatch(mode, expected, outcome.stdout) ? TestCaseVerdict.PASSED : TestCaseVerdict.WRONG_ANSWER;
}
