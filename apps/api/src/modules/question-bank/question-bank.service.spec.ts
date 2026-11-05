import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CodeLanguage, NO_TOPIC, QuestionDifficulty, QuestionStatus, QuestionType } from '@secure-exam/types';
import { BankQuestionQueryDto, CodingProblemInputDto, type SaveBankQuestionDto } from '@secure-exam/validation';
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

/** Records the query builder calls `list()` and `topicSummary()` make. */
function recordingQueryBuilder(result: { many?: unknown[]; total?: number; raw?: unknown[] } = {}) {
  const where: Array<[string, Record<string, unknown> | undefined]> = [];
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['leftJoinAndSelect', 'orderBy', 'addOrderBy', 'skip', 'take', 'select', 'addSelect', 'groupBy', 'addGroupBy']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.andWhere = jest.fn((sql: string, params?: Record<string, unknown>) => {
    where.push([sql, params]);
    return qb;
  });
  qb.where = qb.andWhere;
  qb.getManyAndCount = jest.fn().mockResolvedValue([result.many ?? [], result.total ?? 0]);
  qb.getRawMany = jest.fn().mockResolvedValue(result.raw ?? []);
  return { qb, where };
}

describe('QuestionBankService.list filters', () => {
  const TOPIC = '5f0c3c4e-6a3e-4d55-9a40-2b5b3b1f6a01';
  const COURSE = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
  const EXAM = '11111111-1111-4111-8111-111111111111';

  function listWith(query: Parameters<QuestionBankService['list']>[0]) {
    const { service, questionRepo } = setup();
    const { qb, where } = recordingQueryBuilder();
    (questionRepo as unknown as { createQueryBuilder: jest.Mock }).createQueryBuilder = jest.fn(() => qb);
    return { run: () => service.list(query), qb, where };
  }

  it('applies no filter and the first page by default', async () => {
    const { run, qb, where } = listWith({});
    await expect(run()).resolves.toEqual({ items: [], total: 0, page: 1, limit: 20 });
    expect(where).toEqual([]);
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it.each([
    ['courseId', { courseId: COURSE }, 'q.course_id = :courseId', { courseId: COURSE }],
    ['topicId', { topicId: TOPIC }, 'q.topic_id = :topicId', { topicId: TOPIC }],
    ['difficulty', { difficulty: QuestionDifficulty.HARD }, 'q.difficulty = :difficulty', { difficulty: QuestionDifficulty.HARD }],
    ['type', { type: QuestionType.CODING }, 'q.type = :type', { type: QuestionType.CODING }],
    ['status', { status: QuestionStatus.DRAFT }, 'q.status = :status', { status: QuestionStatus.DRAFT }],
    ['tag (normalized)', { tag: '  Arrays ' }, expect.stringContaining('t.tag = :tag'), { tag: 'arrays' }],
    ['search', { search: '  sorting  ' }, expect.stringContaining('q.text ILIKE :search'), { search: '%sorting%' }],
    ['excludeExamId', { excludeExamId: EXAM }, expect.stringContaining('NOT EXISTS'), { excludeExamId: EXAM }],
  ])('filters by %s', async (_name, query, sql, params) => {
    const { run, where } = listWith(query);
    await run();
    expect(where).toEqual([[sql, params]]);
  });

  it('filters "no topic" with topicId=none', async () => {
    const { run, where } = listWith({ topicId: NO_TOPIC });
    await run();
    expect(where).toEqual([['q.topic_id IS NULL', undefined]]);
  });

  it('escapes LIKE wildcards in the search', async () => {
    const { run, where } = listWith({ search: '50%_off' });
    await run();
    expect(where[0][1]).toEqual({ search: '%50\\%\\_off%' });
  });

  it('ignores a blank search', async () => {
    const { run, where } = listWith({ search: '   ' });
    await run();
    expect(where).toEqual([]);
  });

  it('combines topic, type, difficulty, search and tag with paging', async () => {
    const { run, qb, where } = listWith({
      topicId: TOPIC,
      type: QuestionType.MCQ_SINGLE,
      difficulty: QuestionDifficulty.EASY,
      search: 'loop',
      tag: 'basics',
      page: 3,
      limit: 10,
    });
    await expect(run()).resolves.toMatchObject({ page: 3, limit: 10 });
    expect(where.map(([, p]) => p)).toEqual([
      { search: '%loop%' },
      { topicId: TOPIC },
      { difficulty: QuestionDifficulty.EASY },
      { type: QuestionType.MCQ_SINGLE },
      { tag: 'basics' },
    ]);
    expect(qb.skip).toHaveBeenCalledWith(20);
    expect(qb.take).toHaveBeenCalledWith(10);
  });

  it('keeps excludeExamId alongside the other filters (add-to-exam picker)', async () => {
    const { run, where } = listWith({ topicId: NO_TOPIC, status: QuestionStatus.READY, excludeExamId: EXAM, type: QuestionType.CODING });
    await run();
    expect(where.map(([sql]) => sql)).toEqual([
      'q.topic_id IS NULL',
      'q.type = :type',
      'q.status = :status',
      expect.stringContaining('NOT EXISTS (SELECT 1 FROM exam_questions'),
    ]);
  });
});

describe('BankQuestionQueryDto', () => {
  const errors = async (plain: Record<string, unknown>) =>
    (await validate(plainToInstance(BankQuestionQueryDto, plain))).map((e) => e.property);

  it('accepts a topic id or "none"', async () => {
    expect(await errors({ topicId: '5f0c3c4e-6a3e-4d55-9a40-2b5b3b1f6a01' })).toEqual([]);
    expect(await errors({ topicId: NO_TOPIC })).toEqual([]);
  });

  it('rejects any other topic value', async () => {
    expect(await errors({ topicId: 'nope' })).toEqual(['topicId']);
  });

  it('turns page and limit from the query string into numbers', async () => {
    const dto = plainToInstance(BankQuestionQueryDto, { page: '2', limit: '50' });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 2, limit: 50 });
  });
});

describe('QuestionBankService.topicSummary', () => {
  const topics = [
    { id: 't-arrays', name: 'Arrays', courseId: null },
    { id: 't-dp', name: 'DP', courseId: 'course-1' },
    { id: 't-empty', name: 'Graphs', courseId: null },
  ];

  function summaryWith(raw: unknown[]) {
    const { service, questionRepo, topicRepo } = setup();
    const { qb, where } = recordingQueryBuilder({ raw });
    (questionRepo as unknown as { createQueryBuilder: jest.Mock }).createQueryBuilder = jest.fn(() => qb);
    (topicRepo as unknown as { find: jest.Mock }).find = jest.fn().mockResolvedValue(topics);
    return { service, qb, where, topicRepo: topicRepo as unknown as { find: jest.Mock } };
  }

  it('counts questions per topic and type in one grouped query', async () => {
    const { service, qb } = summaryWith([
      { topicId: 't-arrays', type: QuestionType.MCQ_SINGLE, count: '3' },
      { topicId: 't-arrays', type: QuestionType.CODING, count: '2' },
      { topicId: 't-dp', type: QuestionType.CODING, count: '4' },
      { topicId: null, type: QuestionType.TRUE_FALSE, count: '1' },
    ]);
    const s = await service.topicSummary();
    expect(qb.getRawMany).toHaveBeenCalledTimes(1);
    expect(s.topics).toEqual([
      { id: 't-arrays', name: 'Arrays', courseId: null, total: 5, byType: { MCQ_SINGLE: 3, CODING: 2 } },
      { id: 't-dp', name: 'DP', courseId: 'course-1', total: 4, byType: { CODING: 4 } },
      { id: 't-empty', name: 'Graphs', courseId: null, total: 0, byType: {} },
    ]);
    expect(s.uncategorised).toEqual({ total: 1, byType: { TRUE_FALSE: 1 } });
    expect(s.all).toEqual({ total: 10, byType: { MCQ_SINGLE: 3, CODING: 6, TRUE_FALSE: 1 } });
  });

  it("limits counts to a course, and lists the course's topics plus topics without a course", async () => {
    const { service, where, topicRepo } = summaryWith([]);
    await service.topicSummary('course-1');
    expect(where).toEqual([['q.course_id = :courseId', { courseId: 'course-1' }]]);
    expect(topicRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: [{ courseId: 'course-1' }, { courseId: expect.anything() }] }),
    );
  });
});

describe('CodingProblemInputDto languages (#16)', () => {
  const base = { statementMd: 'S', tests: [{ input: '', expectedOutput: '', isSample: true }] };
  const errors = async (plain: Record<string, unknown>) =>
    (await validate(plainToInstance(CodingProblemInputDto, { ...base, ...plain }))).map((e) => e.property);

  it('accepts any set of known languages and a reference language', async () => {
    expect(await errors({ allowedLanguages: [CodeLanguage.C, CodeLanguage.CPP, CodeLanguage.JAVA], referenceLanguage: CodeLanguage.PYTHON })).toEqual([]);
    expect(await errors({})).toEqual([]);
  });

  it('rejects an empty list, duplicates and unknown languages', async () => {
    expect(await errors({ allowedLanguages: [] })).toEqual(['allowedLanguages']);
    expect(await errors({ allowedLanguages: [CodeLanguage.C, CodeLanguage.C] })).toEqual(['allowedLanguages']);
    expect(await errors({ allowedLanguages: ['rust'] })).toEqual(['allowedLanguages']);
    expect(await errors({ referenceLanguage: 'rust' })).toEqual(['referenceLanguage']);
  });
});
