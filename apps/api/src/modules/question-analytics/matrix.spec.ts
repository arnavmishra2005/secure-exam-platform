import { AttemptStatus, QuestionCellState, QuestionState, QuestionType } from '@secure-exam/types';
import { buildMatrix, type MatrixAnswer, type MatrixAttempt, type MatrixQuestion } from './matrix';

const mcq: MatrixQuestion = {
  id: 'mcq',
  text: 'Pick one',
  type: QuestionType.MCQ_SINGLE,
  marks: 2,
  options: [
    { id: 'a', isCorrect: true },
    { id: 'b', isCorrect: false },
  ],
};
const multi: MatrixQuestion = {
  id: 'multi',
  text: 'Pick all',
  type: QuestionType.MCQ_MULTI,
  marks: 3,
  options: [
    { id: 'x', isCorrect: true },
    { id: 'y', isCorrect: true },
    { id: 'z', isCorrect: false },
  ],
};
const code: MatrixQuestion = { id: 'code', text: 'Sum', type: QuestionType.CODING, marks: 10, options: [] };

const attempt = (id: string, status = AttemptStatus.SUBMITTED): MatrixAttempt => ({
  attemptId: id,
  studentId: `user-${id}`,
  fullName: `Student ${id}`,
  email: `${id}@x.dev`,
  status,
  startedAt: new Date('2026-10-17T09:00:00Z'),
  submittedAt: status === AttemptStatus.IN_PROGRESS ? null : new Date('2026-10-17T10:00:00Z'),
});
const ans = (attemptId: string, questionId: string, patch: Partial<MatrixAnswer>): MatrixAnswer => ({
  attemptId,
  questionId,
  selectedOptionIds: null,
  textResponse: null,
  state: QuestionState.ANSWERED,
  ...patch,
});
const cell = (r: ReturnType<typeof buildMatrix>, a: string, q: string) =>
  r.cells.find((c) => c.attemptId === a && c.questionId === q)!;

describe('buildMatrix', () => {
  it('scores MCQs with the exact-set rule', () => {
    const r = buildMatrix(
      [mcq, multi],
      [attempt('s1'), attempt('s2'), attempt('s3')],
      [
        ans('s1', 'mcq', { selectedOptionIds: ['a'] }),
        ans('s1', 'multi', { selectedOptionIds: ['y', 'x'] }),
        ans('s2', 'mcq', { selectedOptionIds: ['b'] }),
        ans('s2', 'multi', { selectedOptionIds: ['x'] }), // partly right = wrong
        ans('s3', 'mcq', { selectedOptionIds: [], state: QuestionState.MARKED_REVIEW }),
      ],
      [],
      new Set(),
    );
    expect(cell(r, 's1', 'mcq')).toMatchObject({ state: QuestionCellState.CORRECT, score: 2 });
    expect(cell(r, 's1', 'multi')).toMatchObject({ state: QuestionCellState.CORRECT, score: 3 });
    expect(cell(r, 's2', 'mcq')).toMatchObject({ state: QuestionCellState.WRONG, score: 0 });
    expect(cell(r, 's2', 'multi')).toMatchObject({ state: QuestionCellState.WRONG, score: 0 });
    expect(cell(r, 's3', 'mcq')).toMatchObject({ state: QuestionCellState.NOT_ANSWERED, score: 0, markedForReview: true });
    expect(cell(r, 's3', 'multi').state).toBe(QuestionCellState.NOT_ANSWERED);

    expect(r.students.map((s) => [s.attemptId, s.score, s.maxScore, s.answeredCount])).toEqual([
      ['s1', 5, 5, 2],
      ['s2', 0, 5, 2],
      ['s3', 0, 5, 0],
    ]);
  });

  it('uses the final code submission for coding cells', () => {
    const attempts = ['full', 'part', 'zero', 'empty'].map((id) => attempt(id));
    const r = buildMatrix(
      [code],
      attempts,
      [],
      [
        { attemptId: 'full', questionId: 'code', score: 10, passed: 3, total: 3, hasCode: true },
        { attemptId: 'part', questionId: 'code', score: 7.5, passed: 2, total: 3, hasCode: true },
        { attemptId: 'zero', questionId: 'code', score: 0, passed: 0, total: 3, hasCode: true },
        { attemptId: 'empty', questionId: 'code', score: 0, passed: 0, total: 3, hasCode: false },
      ],
      new Set(),
    );
    expect(r.cells.map((c) => [c.attemptId, c.state, c.score])).toEqual([
      ['full', QuestionCellState.CORRECT, 10],
      ['part', QuestionCellState.PARTIAL, 7.5],
      ['zero', QuestionCellState.WRONG, 0],
      ['empty', QuestionCellState.NOT_ANSWERED, 0],
    ]);
    // pass rate counts only finals that actually ran code: 5 of 9
    expect(r.stats[0].testPassRate).toBe(0.56);
  });

  it('marks ungraded coding work as pending with no score', () => {
    const r = buildMatrix(
      [code],
      [attempt('draft', AttemptStatus.IN_PROGRESS), attempt('submitted', AttemptStatus.IN_PROGRESS), attempt('none', AttemptStatus.IN_PROGRESS)],
      [ans('draft', 'code', { textResponse: 'print(1)' }), ans('none', 'code', { textResponse: '   ' })],
      [],
      new Set(['submitted|code']),
    );
    expect(r.cells.map((c) => [c.attemptId, c.state, c.score])).toEqual([
      ['draft', QuestionCellState.PENDING, null],
      ['submitted', QuestionCellState.PENDING, null],
      ['none', QuestionCellState.NOT_ANSWERED, 0],
    ]);
    expect(r.students[0].score).toBe(0);
    expect(r.stats[0]).toMatchObject({ pending: 2, notAnswered: 1, averageScore: 0, accuracy: 0 });
  });

  it('computes per-question stats and option counts', () => {
    const r = buildMatrix(
      [mcq],
      [attempt('s1'), attempt('s2'), attempt('s3'), attempt('s4')],
      [
        ans('s1', 'mcq', { selectedOptionIds: ['a'] }),
        ans('s2', 'mcq', { selectedOptionIds: ['a'] }),
        ans('s3', 'mcq', { selectedOptionIds: ['b'] }),
      ],
      [],
      new Set(),
    );
    expect(r.stats[0]).toEqual({
      questionId: 'mcq',
      attempts: 4,
      answered: 3,
      correct: 2,
      partial: 0,
      wrong: 1,
      notAnswered: 1,
      pending: 0,
      averageScore: 1,
      accuracy: 0.5,
      optionCounts: { a: 2, b: 1 },
    });
  });

  it('numbers questions in exam order and handles an exam with no attempts', () => {
    const r = buildMatrix([mcq, code], [], [], [], new Set());
    expect(r.questions.map((q) => [q.number, q.id])).toEqual([
      [1, 'mcq'],
      [2, 'code'],
    ]);
    expect(r.cells).toEqual([]);
    expect(r.stats[0]).toMatchObject({ attempts: 0, averageScore: null, accuracy: null });
    expect(r.stats[1].testPassRate).toBeNull();
  });
});
