import { TestCaseVerdict } from '@secure-exam/types';
import { scoreTests } from './scoring';

const P = TestCaseVerdict.PASSED;
const F = TestCaseVerdict.WRONG_ANSWER;

describe('scoreTests', () => {
  it('gives partial marks by weight', () => {
    expect(scoreTests(10, [{ weight: 1, verdict: P }, { weight: 1, verdict: P }, { weight: 1, verdict: P }, { weight: 1, verdict: F }]))
      .toEqual({ passed: 3, total: 4, score: 7.5, maxScore: 10 });
    expect(scoreTests(10, [{ weight: 3, verdict: P }, { weight: 1, verdict: F }]).score).toBe(7.5);
    expect(scoreTests(10, [{ weight: 1, verdict: P }, { weight: 3, verdict: F }]).score).toBe(2.5);
  });

  it('gives full and zero marks at the ends', () => {
    expect(scoreTests(5, [{ weight: 2, verdict: P }, { weight: 1, verdict: P }]).score).toBe(5);
    expect(scoreTests(5, [{ weight: 2, verdict: F }, { weight: 1, verdict: TestCaseVerdict.TIME_LIMIT_EXCEEDED }]).score).toBe(0);
  });

  it('rounds to 2 decimals', () => {
    expect(scoreTests(10, [{ weight: 1, verdict: P }, { weight: 1, verdict: F }, { weight: 1, verdict: F }]).score).toBe(3.33);
  });

  it('scores 0 when there are no tests or no weight', () => {
    expect(scoreTests(10, [])).toEqual({ passed: 0, total: 0, score: 0, maxScore: 10 });
    expect(scoreTests(10, [{ weight: 0, verdict: P }]).score).toBe(0);
  });
});
