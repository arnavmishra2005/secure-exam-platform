import { describe, expect, it } from 'vitest';
import { ExecutionStatus, OutputComparisonMode, TestCaseVerdict } from '@secure-exam/types';
import { outputsMatch, verdictFor } from '../coding/compare';

// Same cases as the server's verdict.spec.ts: the two copies must agree.
describe('outputsMatch (client copy of the server rule)', () => {
  it('EXACT', () => {
    expect(outputsMatch(OutputComparisonMode.EXACT, '3\n', '3\r\n')).toBe(true);
    expect(outputsMatch(OutputComparisonMode.EXACT, '3\n', '3')).toBe(false);
  });
  it('TRIM', () => {
    expect(outputsMatch(OutputComparisonMode.TRIM, '1 2\n3\n', '1 2   \n3\n\n\n')).toBe(true);
    expect(outputsMatch(OutputComparisonMode.TRIM, '1 2\n3', ' 1 2\n3')).toBe(false);
    expect(outputsMatch(OutputComparisonMode.TRIM, '1\n\n2', '1\n2')).toBe(false);
  });
  it('TOKENS', () => {
    expect(outputsMatch(OutputComparisonMode.TOKENS, '1 2 3', '1\n2\n   3\n')).toBe(true);
    expect(outputsMatch(OutputComparisonMode.TOKENS, '1 2 3', '1 2')).toBe(false);
  });
  it('maps failed runs straight to their verdict', () => {
    const tle = { status: ExecutionStatus.TIME_LIMIT_EXCEEDED, stdout: '5', stderr: '', exitCode: null, timeMs: 1 };
    expect(verdictFor(tle, '5', OutputComparisonMode.TRIM)).toBe(TestCaseVerdict.TIME_LIMIT_EXCEEDED);
  });
});
