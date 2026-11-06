// The seeded bank questions must be correct: their test cases are what students are graded on.

import { spawnSync } from 'child_process';
import { EASY_CODING_QUESTIONS } from './easy-coding';

const python = spawnSync('python3', ['--version']).status === 0 ? 'python3' : null;
const run = (code: string, input: string) =>
  spawnSync(python!, ['-I', '-B', '-c', code], { input, encoding: 'utf8', timeout: 10_000 });

describe.each(EASY_CODING_QUESTIONS.map((q) => [q.title, q] as const))('seeded bank question: %s', (_title, q) => {
  it('has two sample cases and some hidden ones, with unique names', () => {
    expect(q.testCases.filter((t) => t.isSample)).toHaveLength(2);
    expect(q.testCases.filter((t) => !t.isSample).length).toBeGreaterThanOrEqual(3);
    expect(new Set(q.testCases.map((t) => t.name)).size).toBe(q.testCases.length);
  });

  (python ? it : it.skip)('the Python reference solution produces every expected output', () => {
    for (const t of q.testCases) {
      const result = run(q.reference, t.input);
      expect({ name: t.name, stderr: result.stderr, stdout: result.stdout }).toEqual({
        name: t.name,
        stderr: '',
        stdout: t.expectedOutput,
      });
    }
  });

  (python ? it : it.skip)('the starter code runs but does not solve the first sample', () => {
    const first = q.testCases[0];
    const result = run(q.starter, first.input);
    expect(result.status === 0 && result.stdout === first.expectedOutput).toBe(false);
  });
});
