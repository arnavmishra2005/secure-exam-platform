// The seeded course banks must be correct: their answer keys and test cases are what students are graded on.

import { spawnSync } from 'child_process';
import { COURSE_BANKS } from './course-banks';
import { DEFAULT_INSTRUCTORS } from './instructors';

const python = spawnSync('python3', ['--version']).status === 0 ? 'python3' : null;
const run = (code: string, input: string) =>
  spawnSync(python!, ['-I', '-B', '-c', code], { input, encoding: 'utf8', timeout: 20_000 });

const objective = COURSE_BANKS.flatMap((b) => b.topics.flatMap((t) => t.questions.map((q) => [b.course.code, q] as const)));
const coding = COURSE_BANKS.flatMap((b) => b.topics.flatMap((t) => (t.coding ?? []).map((q) => [b.course.code, q] as const)));

describe('seeded course banks', () => {
  it('gives every default instructor exactly two courses, with unique course codes', () => {
    for (const i of DEFAULT_INSTRUCTORS) {
      expect(COURSE_BANKS.filter((b) => b.instructorEmail === i.email)).toHaveLength(2);
    }
    expect(new Set(COURSE_BANKS.map((b) => b.course.code)).size).toBe(COURSE_BANKS.length);
  });

  it('has two topics per course with at least three questions each', () => {
    for (const b of COURSE_BANKS) {
      expect(b.topics).toHaveLength(2);
      for (const t of b.topics) expect(t.questions.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('never repeats a question text for the same instructor (the seed skips by text)', () => {
    for (const i of DEFAULT_INSTRUCTORS) {
      const texts = COURSE_BANKS.filter((b) => b.instructorEmail === i.email).flatMap((b) =>
        b.topics.flatMap((t) => [...t.questions.map((q) => q.text), ...(t.coding ?? []).map((c) => c.title)]),
      );
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it.each(objective.map(([code, q]) => [code, q.text, q] as const))('%s: %s has a valid answer key', (_c, _t, q) => {
    const correct = q.options.filter((o) => o.correct).length;
    expect(new Set(q.options.map((o) => o.text)).size).toBe(q.options.length);
    expect(q.explanation.length).toBeGreaterThan(0);
    if (q.type === 'MCQ_MULTI') {
      expect(correct).toBeGreaterThanOrEqual(2);
      expect(correct).toBeLessThan(q.options.length);
    } else {
      expect(correct).toBe(1);
    }
    if (q.type === 'TRUE_FALSE') expect(q.options.map((o) => o.text)).toEqual(['True', 'False']);
    else expect(q.options.length).toBeGreaterThanOrEqual(4);
  });
});

describe.each(coding.map(([code, q]) => [code, q.title, q] as const))('%s coding question: %s', (_code, _title, q) => {
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
