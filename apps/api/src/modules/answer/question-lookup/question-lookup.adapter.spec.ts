import { QuestionType } from '@secure-exam/types';
import { QuestionLookupAdapter } from './question-lookup.adapter';

describe('QuestionLookupAdapter.getPublicQuestionsForExam', () => {
  const created = new Date('2026-01-01T00:00:00.000Z');
  const question = {
    id: 'q-1',
    text: 'Pick one',
    type: QuestionType.MCQ_SINGLE,
    marks: 2,
    negativeMarks: null,
    explanation: 'Because B is right',
    createdAt: created,
    updatedAt: created,
    options: [
      { id: 'opt-b', questionId: 'q-1', text: 'B', isCorrect: true, order: 2, question: {} },
      { id: 'opt-a', questionId: 'q-1', text: 'A', isCorrect: false, order: 1, question: {} },
    ],
  };

  function adapterReturning(result: Promise<unknown>) {
    const questionService = { getExamQuestions: jest.fn().mockReturnValue(result) };
    return { adapter: new QuestionLookupAdapter(questionService as any), questionService };
  }

  it('returns the questions without the answer key or explanation, options in order', async () => {
    const { adapter, questionService } = adapterReturning(Promise.resolve([question]));

    const [result] = await adapter.getPublicQuestionsForExam('exam-1');

    expect(questionService.getExamQuestions).toHaveBeenCalledWith('exam-1');
    expect(result).toEqual({
      id: 'q-1',
      text: 'Pick one',
      type: QuestionType.MCQ_SINGLE,
      marks: 2,
      negativeMarks: undefined,
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
      options: [
        { id: 'opt-a', questionId: 'q-1', text: 'A', order: 1 },
        { id: 'opt-b', questionId: 'q-1', text: 'B', order: 2 },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/isCorrect|explanation/);
  });

  it('returns no questions when the lookup fails, like getQuestionsForExam', async () => {
    const { adapter } = adapterReturning(Promise.reject(new Error('exam not found')));

    await expect(adapter.getPublicQuestionsForExam('exam-1')).resolves.toEqual([]);
  });
});
