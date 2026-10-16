/**
 * Owner: Person B. Partial marks by test-case weight.
 */

import { TestCaseVerdict } from '@secure-exam/types';

export interface WeightedVerdict {
  weight: number;
  verdict: TestCaseVerdict;
}

export interface CodeScore {
  passed: number;
  total: number;
  score: number;
  maxScore: number;
}

/**
 * score = marks × (weight of passed tests) / (weight of all tests), rounded
 * to 2 decimals. A question with no tests (or zero total weight) scores 0.
 */
export function scoreTests(marks: number, tests: WeightedVerdict[]): CodeScore {
  const passedTests = tests.filter((t) => t.verdict === TestCaseVerdict.PASSED);
  const totalWeight = tests.reduce((sum, t) => sum + Math.max(0, t.weight), 0);
  const passedWeight = passedTests.reduce((sum, t) => sum + Math.max(0, t.weight), 0);
  const raw = totalWeight > 0 ? (marks * passedWeight) / totalWeight : 0;
  return {
    passed: passedTests.length,
    total: tests.length,
    score: Math.round(raw * 100) / 100,
    maxScore: marks,
  };
}
