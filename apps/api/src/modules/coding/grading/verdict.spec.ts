import { ExecutionStatus, OutputComparisonMode, TestCaseVerdict } from '@secure-exam/types';
import { outputsMatch, verdictFor } from './verdict';

describe('outputsMatch', () => {
  it('EXACT requires identical output (apart from CRLF)', () => {
    expect(outputsMatch(OutputComparisonMode.EXACT, '3\n', '3\n')).toBe(true);
    expect(outputsMatch(OutputComparisonMode.EXACT, '3\n', '3\r\n')).toBe(true);
    expect(outputsMatch(OutputComparisonMode.EXACT, '3\n', '3')).toBe(false);
    expect(outputsMatch(OutputComparisonMode.EXACT, '3\n', '3 \n')).toBe(false);
  });

  it('TRIM ignores trailing spaces per line and trailing blank lines only', () => {
    expect(outputsMatch(OutputComparisonMode.TRIM, '1 2\n3\n', '1 2   \n3\n\n\n')).toBe(true);
    expect(outputsMatch(OutputComparisonMode.TRIM, '1 2\n3', '1 2\n3\n')).toBe(true);
    expect(outputsMatch(OutputComparisonMode.TRIM, '1 2\n3', ' 1 2\n3')).toBe(false);
    expect(outputsMatch(OutputComparisonMode.TRIM, '1 2\n3', '1  2\n3')).toBe(false);
    expect(outputsMatch(OutputComparisonMode.TRIM, '1\n\n2', '1\n2')).toBe(false);
  });

  it('TOKENS ignores all whitespace layout', () => {
    expect(outputsMatch(OutputComparisonMode.TOKENS, '1 2 3', '1\n2\n   3\n')).toBe(true);
    expect(outputsMatch(OutputComparisonMode.TOKENS, '1 2 3', '1 2')).toBe(false);
    expect(outputsMatch(OutputComparisonMode.TOKENS, '1 2 3', '1 2 4')).toBe(false);
    expect(outputsMatch(OutputComparisonMode.TOKENS, '', '  \n')).toBe(true);
  });
});

describe('verdictFor', () => {
  const ok = (stdout: string) => ({ status: ExecutionStatus.OK, stdout, stderr: '', exitCode: 0, timeMs: 5 });

  it('compares output when the program exited cleanly', () => {
    expect(verdictFor(ok('5\n'), '5', OutputComparisonMode.TRIM)).toBe(TestCaseVerdict.PASSED);
    expect(verdictFor(ok('6\n'), '5', OutputComparisonMode.TRIM)).toBe(TestCaseVerdict.WRONG_ANSWER);
  });

  it('maps a failed execution straight to its verdict, without comparing', () => {
    const tle = { ...ok('5'), status: ExecutionStatus.TIME_LIMIT_EXCEEDED };
    expect(verdictFor(tle, '5', OutputComparisonMode.TRIM)).toBe(TestCaseVerdict.TIME_LIMIT_EXCEEDED);
    const re = { ...ok('5'), status: ExecutionStatus.RUNTIME_ERROR };
    expect(verdictFor(re, '5', OutputComparisonMode.TRIM)).toBe(TestCaseVerdict.RUNTIME_ERROR);
  });
});
