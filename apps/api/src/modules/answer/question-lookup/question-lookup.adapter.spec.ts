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

  function adapterReturning(result: Promise<unknown>, coding = new Map<string, unknown>()) {
    const questionService = { getExamQuestions: jest.fn().mockReturnValue(result) };
    const codingContent = { getPublicProblems: jest.fn().mockResolvedValue(coding) };
    return {
      adapter: new QuestionLookupAdapter(questionService as any, codingContent as any),
      questionService,
      codingContent,
    };
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

  it('adds the public coding problem to CODING questions only', async () => {
    const codingQuestion = { ...question, id: 'q-2', type: QuestionType.CODING, options: [] };
    const publicProblem = { statementMd: 'Sum', starterCode: {}, allowedLanguages: ['python'], samples: [] };
    const { adapter, codingContent } = adapterReturning(
      Promise.resolve([question, codingQuestion]),
      new Map([['q-2', publicProblem]]),
    );

    const [mcq, coding] = await adapter.getPublicQuestionsForExam('exam-1');

    expect(codingContent.getPublicProblems).toHaveBeenCalledWith(['q-2']);
    expect(mcq).not.toHaveProperty('coding');
    expect(coding.coding).toEqual(publicProblem);
  });
});

describe('QuestionLookupAdapter.getQuestionsForExam', () => {
  const base = { marks: 1, options: [] };

  it('maps CODING to CODE and unknown types to TEXT (never to an MCQ format)', async () => {
    const questionService = {
      getExamQuestions: jest.fn().mockResolvedValue([
        { ...base, id: 'q-code', type: QuestionType.CODING },
        { ...base, id: 'q-new', type: 'SOMETHING_NEW' },
        { ...base, id: 'q-tf', type: QuestionType.TRUE_FALSE },
        { ...base, id: 'q-multi', type: QuestionType.MCQ_MULTI },
      ]),
    };
    const adapter = new QuestionLookupAdapter(questionService as any, {} as any);

    const formats = (await adapter.getQuestionsForExam('exam-1')).map((q) => [q.id, q.answerFormat]);

    expect(formats).toEqual([
      ['q-code', 'CODE'],
      ['q-new', 'TEXT'],
      ['q-tf', 'SINGLE_CHOICE'],
      ['q-multi', 'MULTIPLE_CHOICE'],
    ]);
  });
});
