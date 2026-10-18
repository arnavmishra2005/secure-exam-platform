import { BadRequestException, ConflictException } from '@nestjs/common';
import { QuestionStatus, QuestionType } from '@secure-exam/types';
import type { SaveBankQuestionDto } from '@secure-exam/validation';
import { QuestionBankService } from './question-bank.service';

function setup() {
  const questionRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), delete: jest.fn() };
  const topicRepo = { findOne: jest.fn() };
  const examQuestionRepo = { find: jest.fn().mockResolvedValue([]), insert: jest.fn(), exist: jest.fn() };
  const problemRepo = { find: jest.fn().mockResolvedValue([]) };
  const lockService = {
    assertContentEditable: jest.fn().mockResolvedValue(undefined),
    assertExamComposable: jest.fn().mockResolvedValue({ id: 'exam-1' }),
    usage: jest.fn().mockResolvedValue(new Map()),
  };
  const dataSource = { transaction: jest.fn() };
  const auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new QuestionBankService(
    questionRepo as never,
    topicRepo as never,
    {} as never,
    examQuestionRepo as never,
    problemRepo as never,
    {} as never,
    dataSource as never,
    lockService as never,
    auditService as never,
  );
  return { service, questionRepo, topicRepo, examQuestionRepo, problemRepo, lockService, dataSource };
}

const mcq: SaveBankQuestionDto = {
  text: 'Pick',
  type: QuestionType.MCQ_SINGLE,
  marks: 1,
  options: [
    { text: 'a', isCorrect: true, order: 0 },
    { text: 'b', isCorrect: false, order: 1 },
  ],
};
const coding: SaveBankQuestionDto = {
  text: 'Sum',
  type: QuestionType.CODING,
  marks: 5,
  coding: { statementMd: 'Add', tests: [{ input: '1 2', expectedOutput: '3', isSample: true }] },
};

describe('QuestionBankService.validateContent', () => {
  it('accepts a valid MCQ and a valid coding question', async () => {
    const { service } = setup();
    await expect(service.validateContent(mcq)).resolves.toBeUndefined();
    await expect(service.validateContent(coding)).resolves.toBeUndefined();
  });

  it('rejects mixed shapes', async () => {
    const { service } = setup();
    await expect(service.validateContent({ ...coding, options: mcq.options })).rejects.toThrow('has no options');
    await expect(service.validateContent({ ...coding, coding: undefined })).rejects.toThrow('needs a coding problem');
    await expect(service.validateContent({ ...mcq, coding: coding.coding })).rejects.toThrow(
      'Only coding questions',
    );
  });

  it('applies the option rules to MCQs', async () => {
    const { service } = setup();
    const twoCorrect = { ...mcq, options: mcq.options!.map((o) => ({ ...o, isCorrect: true })) };
    await expect(service.validateContent(twoCorrect)).rejects.toThrow('exactly one correct');
  });

  it('rejects starter code for an unknown language', async () => {
    const { service } = setup();
    const dto = { ...coding, coding: { ...coding.coding!, starterCode: { cobol: 'x' } as never } };
    await expect(service.validateContent(dto)).rejects.toThrow('Unsupported starter code language');
  });

  it('checks the topic exists and matches the course', async () => {
    const { service, topicRepo } = setup();
    topicRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.validateContent({ ...mcq, topicId: 't-1' })).rejects.toThrow('Topic not found');
    topicRepo.findOne.mockResolvedValueOnce({ id: 't-1', courseId: 'course-A' });
    await expect(service.validateContent({ ...mcq, topicId: 't-1', courseId: 'course-B' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('QuestionBankService.replace on a question students have answered', () => {
  const answered = {
    id: 'q-1',
    type: QuestionType.MCQ_SINGLE,
    status: QuestionStatus.READY,
    options: [
      { id: 'opt-b', order: 1 },
      { id: 'opt-a', order: 0 },
    ],
  };

  it("refuses a type change or a different number of options", async () => {
    const { service, questionRepo, lockService, dataSource } = setup();
    questionRepo.findOne.mockResolvedValue(answered);
    (lockService as unknown as { isLocked: jest.Mock }).isLocked = jest.fn().mockResolvedValue(true);

    await expect(service.replace('q-1', { ...mcq, type: QuestionType.MCQ_MULTI }, 'admin')).rejects.toThrow("type can't change");
    const threeOptions = { ...mcq, options: [...mcq.options!, { text: 'c', isCorrect: false, order: 2 }] };
    await expect(service.replace('q-1', threeOptions, 'admin')).rejects.toThrow("can't be added or removed");
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('updates options in place by position so student answers keep pointing at them', async () => {
    const { service, questionRepo, lockService, dataSource } = setup();
    questionRepo.findOne.mockResolvedValue(answered);
    (lockService as unknown as { isLocked: jest.Mock }).isLocked = jest.fn().mockResolvedValue(true);
    (lockService as unknown as { liveExams: jest.Mock }).liveExams = jest.fn().mockResolvedValue([]);
    const optionRepo = { update: jest.fn(), delete: jest.fn(), insert: jest.fn() };
    const tagRepo = { delete: jest.fn(), insert: jest.fn() };
    const questionTxRepo = { update: jest.fn() };
    const repos = new Map<string, unknown>([
      ['OptionEntity', optionRepo],
      ['QuestionTagEntity', tagRepo],
      ['QuestionEntity', questionTxRepo],
    ]);
    dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<unknown>) =>
      cb({ getRepository: (e: { name: string }) => repos.get(e.name) ?? { delete: jest.fn(), insert: jest.fn(), save: jest.fn(), create: (x: unknown) => x } }),
    );
    jest.spyOn(service, 'get').mockResolvedValue({} as never);

    // Fix the answer key: the second option is the correct one.
    await service.replace('q-1', { ...mcq, options: [{ text: 'a', isCorrect: false, order: 0 }, { text: 'b', isCorrect: true, order: 1 }] }, 'admin');

    expect(optionRepo.update).toHaveBeenCalledWith({ id: 'opt-a' }, { text: 'a', isCorrect: false, order: 0 });
    expect(optionRepo.update).toHaveBeenCalledWith({ id: 'opt-b' }, { text: 'b', isCorrect: true, order: 1 });
    expect(optionRepo.delete).not.toHaveBeenCalled();
    expect(optionRepo.insert).not.toHaveBeenCalled();
  });
});

describe('QuestionBankService.remove', () => {
  it('refuses a question that is attached to an exam', async () => {
    const { service, questionRepo, examQuestionRepo } = setup();
    questionRepo.findOne.mockResolvedValue({ id: 'q-1' });
    examQuestionRepo.exist.mockResolvedValue(true);
    await expect(service.remove('q-1', 'admin-1')).rejects.toThrow('attached to one or more exams');
    expect(questionRepo.delete).not.toHaveBeenCalled();
  });

  it('turns an answers foreign-key violation into a 409 suggesting archive', async () => {
    const { service, questionRepo, examQuestionRepo } = setup();
    questionRepo.findOne.mockResolvedValue({ id: 'q-1' });
    examQuestionRepo.exist.mockResolvedValue(false);
    questionRepo.delete.mockRejectedValue(Object.assign(new Error('fk'), { code: '23503' }));
    await expect(service.remove('q-1', 'admin-1')).rejects.toThrow('can only be archived');
  });
});

describe('QuestionBankService.bulkAddToExam', () => {
  it('appends READY questions after the current last one and explains every skip', async () => {
    const { service, questionRepo, examQuestionRepo, problemRepo } = setup();
    questionRepo.find.mockResolvedValue([
      { id: 'ready', status: QuestionStatus.READY, type: QuestionType.MCQ_SINGLE },
      { id: 'draft', status: QuestionStatus.DRAFT, type: QuestionType.MCQ_SINGLE },
      { id: 'in-exam', status: QuestionStatus.READY, type: QuestionType.MCQ_SINGLE },
      { id: 'code-ok', status: QuestionStatus.READY, type: QuestionType.CODING },
      { id: 'code-bare', status: QuestionStatus.READY, type: QuestionType.CODING },
    ]);
    examQuestionRepo.find.mockResolvedValue([{ questionId: 'in-exam', order: 4 }]);
    problemRepo.find.mockResolvedValue([{ questionId: 'code-ok' }]);

    const res = await service.bulkAddToExam(
      'exam-1',
      ['ready', 'draft', 'in-exam', 'missing', 'code-ok', 'code-bare', 'ready'],
      'admin-1',
    );

    expect(res.added).toEqual(['ready', 'code-ok']);
    expect(res.skipped.map((s) => s.questionId)).toEqual(['draft', 'in-exam', 'missing', 'code-bare']);
    expect(examQuestionRepo.insert).toHaveBeenCalledWith([
      { examId: 'exam-1', questionId: 'ready', order: 5 },
      { examId: 'exam-1', questionId: 'code-ok', order: 6 },
    ]);
  });

  it('refuses when the exam is live', async () => {
    const { service, lockService, examQuestionRepo } = setup();
    lockService.assertExamComposable.mockRejectedValue(new ConflictException('ACTIVE'));
    await expect(service.bulkAddToExam('exam-1', ['q'], 'a')).rejects.toBeInstanceOf(ConflictException);
    expect(examQuestionRepo.insert).not.toHaveBeenCalled();
  });
});
