import { CodeSubmissionStatus, QuestionState, QuestionType, ScoreSource } from '@secure-exam/types';
import { ResultTotalsService } from './result-totals.service';

/** A transaction manager whose question_scores query returns `adjusted` and code submissions `finals`. */
function managerWith(adjusted: Array<{ questionId: string; manualAdjustment: number }>, finals: unknown[] = []) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['select', 'where', 'delete', 'andWhere']) qb[m] = jest.fn(() => qb);
  qb.getMany = jest.fn().mockResolvedValue(adjusted);
  qb.execute = jest.fn().mockResolvedValue({});
  return {
    qb,
    getRepository: (entity: { name: string }) =>
      entity.name === 'QuestionScoreEntity' ? { createQueryBuilder: () => qb } : { find: jest.fn().mockResolvedValue(finals) },
  };
}
const recorder = () => ({ record: jest.fn(), recordMany: jest.fn().mockResolvedValue(undefined) });

describe('ResultTotalsService.recompute', () => {
  it('sums MCQ (exact-set) and final code scores with current marks and replaces the totals', async () => {
    const attempts = {
      getAnswers: jest.fn().mockResolvedValue([
        { questionId: 'm1', selectedOptionIds: ['a'], textResponse: null, state: QuestionState.ANSWERED },
        { questionId: 'm2', selectedOptionIds: ['x'], textResponse: null, state: QuestionState.ANSWERED },
      ]),
    };
    const scoreSink = { replaceTotals: jest.fn() };
    const scores = recorder();
    const service = new ResultTotalsService(attempts as never, scoreSink as never, {} as never, {} as never, scores as never);
    const questions = [
      { id: 'm1', text: '', type: QuestionType.MCQ_SINGLE, marks: 3, options: [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: false }] },
      { id: 'm2', text: '', type: QuestionType.MCQ_SINGLE, marks: 2, options: [{ id: 'x', isCorrect: false }, { id: 'y', isCorrect: true }] },
      { id: 'c1', text: '', type: QuestionType.CODING, marks: 10, options: [] },
    ];
    const manager = managerWith([], [
      { questionId: 'c1', score: 7.5, passed: 3, total: 4, code: 'print(1)', isFinal: true, status: CodeSubmissionStatus.GRADED },
    ]);

    await service.recompute(manager as never, 'e1', 'a1', questions);

    expect(scoreSink.replaceTotals).toHaveBeenCalledWith(manager, 'a1', 10.5, 15);
    // The per-question scores students see are rewritten too, not only the total.
    expect(scores.recordMany).toHaveBeenCalledWith(
      'a1',
      [
        expect.objectContaining({ questionId: 'm1', source: ScoreSource.AUTO_MCQ, score: 3, maxScore: 3, isCorrect: true }),
        expect.objectContaining({ questionId: 'm2', source: ScoreSource.AUTO_MCQ, score: 0, maxScore: 2, isCorrect: false }),
        expect.objectContaining({ questionId: 'c1', source: ScoreSource.AUTO_CODE, score: 7.5, maxScore: 10, isCorrect: false }),
      ],
      manager,
    );
    // Rows of questions removed from the exam are deleted.
    expect(manager.qb.andWhere).toHaveBeenCalledWith('"questionId" NOT IN (:...current)', { current: ['m1', 'm2', 'c1'] });
    expect(manager.qb.execute).toHaveBeenCalled();
  });

  it('applies negative marks to a wrong answer and none to an unanswered one, like grading at submit time', async () => {
    const attempts = {
      getAnswers: jest.fn().mockResolvedValue([
        { questionId: 'm1', selectedOptionIds: ['b'], textResponse: null, state: QuestionState.ANSWERED }, // wrong: −1
        { questionId: 'm2', selectedOptionIds: [], textResponse: null, state: QuestionState.VISITED }, // unanswered: 0
      ]),
    };
    const scoreSink = { replaceTotals: jest.fn() };
    const scores = recorder();
    const service = new ResultTotalsService(attempts as never, scoreSink as never, {} as never, {} as never, scores as never);
    const questions = [
      { id: 'm1', text: '', type: QuestionType.MCQ_SINGLE, marks: 4, negativeMarks: 1, options: [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: false }] },
      { id: 'm2', text: '', type: QuestionType.MCQ_SINGLE, marks: 2, negativeMarks: 0.5, options: [{ id: 'x', isCorrect: true }] },
    ];
    const manager = managerWith([]);

    await service.recompute(manager as never, 'e1', 'a1', questions);

    expect(scoreSink.replaceTotals).toHaveBeenCalledWith(manager, 'a1', -1, 6);
    expect(scores.recordMany).toHaveBeenCalledWith(
      'a1',
      [
        expect.objectContaining({ questionId: 'm1', score: -1, isCorrect: false }),
        expect.objectContaining({ questionId: 'm2', score: 0, isCorrect: null }),
      ],
      manager,
    );
  });

  it('keeps manual adjustments (#13) on top of the recalculated scores, within each question\'s marks', async () => {
    const attempts = {
      getAnswers: jest.fn().mockResolvedValue([
        { questionId: 'm1', selectedOptionIds: ['b'], textResponse: null, state: QuestionState.ANSWERED }, // wrong: 0
        { questionId: 'm2', selectedOptionIds: ['y'], textResponse: null, state: QuestionState.ANSWERED }, // right: 2
      ]),
    };
    const scoreSink = { replaceTotals: jest.fn() };
    const scores = recorder();
    const service = new ResultTotalsService(attempts as never, scoreSink as never, {} as never, {} as never, scores as never);
    const questions = [
      { id: 'm1', text: '', type: QuestionType.MCQ_SINGLE, marks: 3, options: [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: false }] },
      { id: 'm2', text: '', type: QuestionType.MCQ_SINGLE, marks: 2, options: [{ id: 'x', isCorrect: false }, { id: 'y', isCorrect: true }] },
    ];
    const manager = managerWith([
      { questionId: 'm1', manualAdjustment: 1.5 },
      { questionId: 'm2', manualAdjustment: 5 }, // capped at the question's 2 marks
    ]);

    await service.recompute(manager as never, 'e1', 'a1', questions);

    expect(scoreSink.replaceTotals).toHaveBeenCalledWith(manager, 'a1', 3.5, 5);
  });
});
