import { QuestionType, ScoreSource } from '@secure-exam/types';
import { evaluateObjectiveAnswers, GradableQuestion } from './mcq-evaluator';

describe('evaluateObjectiveAnswers', () => {
  const single: GradableQuestion = {
    id: 'q1',
    type: QuestionType.MCQ_SINGLE,
    marks: 2,
    negativeMarks: 0.5,
    options: [
      { id: 'a', isCorrect: true },
      { id: 'b', isCorrect: false },
    ],
  };
  const multi: GradableQuestion = {
    id: 'q2',
    type: QuestionType.MCQ_MULTI,
    marks: 3,
    negativeMarks: null,
    options: [
      { id: 'x', isCorrect: true },
      { id: 'y', isCorrect: false },
      { id: 'z', isCorrect: true },
    ],
  };

  it('awards full marks for an exact match', () => {
    const [score] = evaluateObjectiveAnswers([single], [{ questionId: 'q1', selectedOptionIds: ['a'] }]);
    expect(score).toMatchObject({ questionId: 'q1', source: ScoreSource.AUTO_MCQ, score: 2, maxScore: 2, isCorrect: true });
  });

  it('applies negative marking to a wrong answer', () => {
    const [score] = evaluateObjectiveAnswers([single], [{ questionId: 'q1', selectedOptionIds: ['b'] }]);
    expect(score).toMatchObject({ score: -0.5, isCorrect: false });
  });

  it('scores an unanswered question 0 with isCorrect null', () => {
    const [score] = evaluateObjectiveAnswers([single], []);
    expect(score).toMatchObject({ score: 0, isCorrect: null });
  });

  it('treats an empty selection as unanswered', () => {
    const [score] = evaluateObjectiveAnswers([single], [{ questionId: 'q1', selectedOptionIds: [] }]);
    expect(score.isCorrect).toBeNull();
  });

  it('gives no partial credit for a partially-correct multi-select, and no penalty when negativeMarks is unset', () => {
    const [score] = evaluateObjectiveAnswers([multi], [{ questionId: 'q2', selectedOptionIds: ['x'] }]);
    expect(score).toMatchObject({ score: -0, isCorrect: false });
    expect(score.score).toBeCloseTo(0);
  });

  it('accepts a multi-select in any order and ignores duplicate ids', () => {
    const [score] = evaluateObjectiveAnswers([multi], [{ questionId: 'q2', selectedOptionIds: ['z', 'x', 'z'] }]);
    expect(score).toMatchObject({ score: 3, isCorrect: true });
  });

  it('skips non-objective questions so their own grader can score them', () => {
    const coding: GradableQuestion = { id: 'q3', type: 'CODING', marks: 10, options: [] };
    expect(evaluateObjectiveAnswers([coding], [])).toEqual([]);
  });
});
