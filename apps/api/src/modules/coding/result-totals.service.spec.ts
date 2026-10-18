import { CodeSubmissionStatus, QuestionState, QuestionType } from '@secure-exam/types';
import { ResultTotalsService } from './result-totals.service';

describe('ResultTotalsService.recompute', () => {
  it('sums MCQ (exact-set) and final code scores with current marks and replaces the totals', async () => {
    const attempts = {
      getAnswers: jest.fn().mockResolvedValue([
        { questionId: 'm1', selectedOptionIds: ['a'], textResponse: null, state: QuestionState.ANSWERED },
        { questionId: 'm2', selectedOptionIds: ['x'], textResponse: null, state: QuestionState.ANSWERED },
      ]),
    };
    const scoreSink = { replaceTotals: jest.fn() };
    const service = new ResultTotalsService(attempts as never, scoreSink as never, {} as never, {} as never);
    const questions = [
      { id: 'm1', text: '', type: QuestionType.MCQ_SINGLE, marks: 3, options: [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: false }] },
      { id: 'm2', text: '', type: QuestionType.MCQ_SINGLE, marks: 2, options: [{ id: 'x', isCorrect: false }, { id: 'y', isCorrect: true }] },
      { id: 'c1', text: '', type: QuestionType.CODING, marks: 10, options: [] },
    ];
    const repo = {
      find: jest.fn().mockResolvedValue([
        { questionId: 'c1', score: 7.5, passed: 3, total: 4, code: 'print(1)', isFinal: true, status: CodeSubmissionStatus.GRADED },
      ]),
    };
    const manager = { getRepository: () => repo };

    await service.recompute(manager as never, 'e1', 'a1', questions);

    expect(scoreSink.replaceTotals).toHaveBeenCalledWith(manager, 'a1', 10.5, 15);
  });
});
