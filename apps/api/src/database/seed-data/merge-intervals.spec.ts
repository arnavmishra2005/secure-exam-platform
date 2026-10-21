// The seeded coding question must be correct: its test cases are what students are graded on.

import { spawnSync } from 'child_process';
import {
  MERGE_INTERVALS_REFERENCE,
  MERGE_INTERVALS_STARTER,
  MERGE_INTERVALS_TEST_CASES,
  mergeIntervals,
} from './merge-intervals';

const python = spawnSync('python3', ['--version']).status === 0 ? 'python3' : null;
const run = (code: string, input: string) =>
  spawnSync(python!, ['-I', '-B', '-c', code], { input, encoding: 'utf8', timeout: 10_000 });

describe('seeded coding question: Merge Intervals', () => {
  it('merges the way the statement says', () => {
    expect(mergeIntervals([[1, 3], [8, 10], [2, 6], [15, 18]])).toEqual([[1, 6], [8, 10], [15, 18]]);
    expect(mergeIntervals([[1, 4], [4, 5]])).toEqual([[1, 5]]); // touching intervals merge
    expect(mergeIntervals([[1, 3], [5, 7], [9, 11], [2, 10]])).toEqual([[1, 11]]); // a late interval bridges
    expect(mergeIntervals([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]); // a gap of 1 does not merge
  });

  it('has two sample cases and several hidden ones', () => {
    const samples = MERGE_INTERVALS_TEST_CASES.filter((t) => t.isSample);
    expect(samples).toHaveLength(2);
    expect(MERGE_INTERVALS_TEST_CASES.length - samples.length).toBeGreaterThanOrEqual(6);
  });

  it('every case has well-formed input (n matches the number of lines)', () => {
    for (const t of MERGE_INTERVALS_TEST_CASES) {
      const lines = t.input.trim().split('\n');
      expect(Number(lines[0])).toBe(lines.length - 1);
    }
  });

  (python ? it : it.skip)('the Python reference solution produces every expected output', () => {
    for (const t of MERGE_INTERVALS_TEST_CASES) {
      const result = run(MERGE_INTERVALS_REFERENCE, t.input);
      expect({ name: t.name, stderr: result.stderr, stdout: result.stdout }).toEqual({
        name: t.name,
        stderr: '',
        stdout: t.expectedOutput,
      });
    }
  });

  (python ? it : it.skip)('the starter code reads the input but does not solve it', () => {
    const result = run(MERGE_INTERVALS_STARTER, MERGE_INTERVALS_TEST_CASES[0].input);
    // `pass` returns None, so the loop over it fails: a student has to write the function.
    expect(result.status).not.toBe(0);
  });
});
