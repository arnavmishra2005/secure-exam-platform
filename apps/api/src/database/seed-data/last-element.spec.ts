// The seeded coding question must be correct: its test cases are what students are graded on.

import { spawnSync } from 'child_process';
import { LAST_ELEMENT_REFERENCE, LAST_ELEMENT_STARTER, LAST_ELEMENT_TEST_CASES } from './last-element';

const python = spawnSync('python3', ['--version']).status === 0 ? 'python3' : null;
const run = (code: string, input: string) =>
  spawnSync(python!, ['-I', '-B', '-c', code], { input, encoding: 'utf8', timeout: 10_000 });

describe('seeded coding question: Last Element of a List', () => {
  it('has two sample cases and several hidden ones', () => {
    const samples = LAST_ELEMENT_TEST_CASES.filter((t) => t.isSample);
    expect(samples).toHaveLength(2);
    expect(LAST_ELEMENT_TEST_CASES.length - samples.length).toBeGreaterThanOrEqual(4);
  });

  it('every case has well-formed input (n matches the number of values)', () => {
    for (const t of LAST_ELEMENT_TEST_CASES) {
      const [n, values] = t.input.trim().split('\n');
      expect(values.split(' ')).toHaveLength(Number(n));
    }
  });

  (python ? it : it.skip)('the Python reference solution produces every expected output', () => {
    for (const t of LAST_ELEMENT_TEST_CASES) {
      const result = run(LAST_ELEMENT_REFERENCE, t.input);
      expect({ name: t.name, stderr: result.stderr, stdout: result.stdout }).toEqual({
        name: t.name,
        stderr: '',
        stdout: t.expectedOutput,
      });
    }
  });

  (python ? it : it.skip)('the starter code reads the input but does not solve it', () => {
    const result = run(LAST_ELEMENT_STARTER, LAST_ELEMENT_TEST_CASES[0].input);
    // `pass` returns None, so the starter prints "None": a student has to write the function.
    expect(result.stdout).not.toBe(LAST_ELEMENT_TEST_CASES[0].expectedOutput);
  });
});
