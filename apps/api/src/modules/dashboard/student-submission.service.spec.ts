import { NotFoundException } from '@nestjs/common';
import { AttemptStatus, CodeLanguage, CodeSubmissionStatus, QuestionType, TestCaseVerdict, encodeCodeDraft } from '@secure-exam/types';
import { StudentSubmissionService } from './student-submission.service';

function setup(published = false, opts: { finals?: unknown[]; answers?: unknown[]; gradeUnsubmittedCode?: boolean } = {}) {
  const date = new Date('2026-11-01T10:00:00Z');
  const attempt = { id: 'attempt', studentId: 'alice', submittedAt: date };
  const repos: Record<string, any> = {
    AttemptEntity: { findOne: jest.fn(async ({ where }) => where.studentId === 'alice' ? attempt : null) },
    ExamEntity: { findOne: jest.fn(async () => ({ title: 'Exam', gradeUnsubmittedCode: opts.gradeUnsubmittedCode ?? false, passPercentage: 40, passMarkEnabled: false })) },
    AnswerEntity: { find: jest.fn(async () => opts.answers ?? [{ questionId: 'mcq', selectedOptionIds: ['wrong'], markedForReview: true }]) },
    ResultEntity: { findOne: jest.fn(async () => ({ published, score: 4, maxScore: 10 })) },
    CodeSubmissionEntity: { find: jest.fn(async () => opts.finals ?? [{ id: 'sub', questionId: 'code', code: 'print(1)', language: 'python', isFinal: true, fromDraft: false, status: CodeSubmissionStatus.GRADED, createdAt: date, passed: 1, total: 2, resultsJson: [
      { testCaseId: 'sample', verdict: TestCaseVerdict.PASSED, timeMs: 2, stdout: '1', stderr: '' },
      { testCaseId: 'hidden', verdict: TestCaseVerdict.WRONG_ANSWER, timeMs: 3, stdout: 'SECRET INPUT ECHO', stderr: 'SECRET traceback' },
    ] }]) },
    QuestionScoreEntity: { find: jest.fn(async () => [{ questionId: 'mcq', score: -1, maxScore: 5, isCorrect: false, autoScore: -1, manualAdjustment: 0 }, { questionId: 'code', score: 5, maxScore: 5, autoScore: 3, manualAdjustment: 2, adjustReason: 'Reviewed' }]) },
    CodingTestCaseEntity: { find: jest.fn(async () => [{ id: 'sample', questionId: 'code', isSample: true, input: '1', expectedOutput: '1' }, { id: 'hidden', questionId: 'code', isSample: false, input: 'SECRET', expectedOutput: 'SECRET EXPECTED' }]) },
  };
  const questions = { getExamQuestions: jest.fn(async () => [
    { id: 'mcq', text: 'Pick', type: QuestionType.MCQ_SINGLE, marks: 5, createdAt: date, updatedAt: date, explanation: 'SECRET EXPLANATION', options: [{ id: 'right', questionId: 'mcq', text: 'Right', order: 1, isCorrect: true }] },
    { id: 'code', text: 'Code', type: QuestionType.CODING, marks: 5, createdAt: date, updatedAt: date, options: [] },
  ]) };
  const service = new StudentSubmissionService({ getRepository: (e: { name: string }) => repos[e.name] } as never, questions as never, { getPublicProblems: async () => new Map() } as never);
  return { service, repos };
}

describe('own submission review', () => {
  it('scopes to the owner and finalized statuses', async () => {
    const { service, repos } = setup();
    await expect(service.get('bob', 'exam')).rejects.toBeInstanceOf(NotFoundException);
    expect(repos.AttemptEntity.findOne).toHaveBeenCalledWith({ where: { examId: 'exam', studentId: 'bob', status: expect.objectContaining({ _value: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] }) } });
    expect(repos.AnswerEntity.find).not.toHaveBeenCalled();
  });
  it('returns saved answers without keys, scores, explanations or test details before publication', async () => {
    const { service, repos } = setup();
    const result = await service.get('alice', 'exam');
    expect(result.questions[0].selectedOptionIds).toEqual(['wrong']);
    expect(result.result).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/isCorrect|correctOptionIds|analysis|SECRET|resultsJson/);
    expect(repos.QuestionScoreEntity.find).not.toHaveBeenCalled();
    expect(repos.CodingTestCaseEntity.find).not.toHaveBeenCalled();
  });
  it('reveals keys, adjustments and all test details only after publication', async () => {
    const { service } = setup(true);
    const result = await service.get('alice', 'exam');
    expect(result.questions[0].analysis).toMatchObject({ correctOptionIds: ['right'], explanation: 'SECRET EXPLANATION', reason: 'Wrong option chosen' });
    const analysis = result.questions[1].analysis!;
    expect(analysis).toMatchObject({ autoScore: 3, manualAdjustment: 2, adjustReason: 'Reviewed' });
    expect(analysis.tests![0]).toMatchObject({ input: '1', stdout: '1', expectedOutput: '1' });
    expect(analysis.tests![1]).toEqual({ index: 2, isSample: false, verdict: TestCaseVerdict.WRONG_ANSWER, timeMs: 3, input: 'SECRET', expectedOutput: 'SECRET EXPECTED', stdout: 'SECRET INPUT ECHO', stderr: 'SECRET traceback' });
    expect(result.result).toMatchObject({ percentage: 40, passed: null });
  });

  // The 0-score final row the grader writes when there was no gradeable code.
  const noCodeFinal = (language = 'python') => ({ id: 'none', questionId: 'code', code: '', language, isFinal: true, fromDraft: true,
    status: CodeSubmissionStatus.GRADED, createdAt: new Date('2026-11-01T10:00:00Z'), passed: 0, total: 0, resultsJson: [] });

  it('shows every test case, hidden ones included, after publication even when the student wrote no code', async () => {
    const { service } = setup(true, { finals: [noCodeFinal()], answers: [] });
    const analysis = (await service.get('alice', 'exam')).questions[1].analysis!;
    expect(analysis.tests).toEqual([
      { index: 1, isSample: true, verdict: null, timeMs: null, input: '1', expectedOutput: '1' },
      { index: 2, isSample: false, verdict: null, timeMs: null, input: 'SECRET', expectedOutput: 'SECRET EXPECTED' },
    ]);
    expect(analysis).toMatchObject({ total: 2, passed: 0 });
    expect(analysis.reason).toMatch(/^No code was written, so no tests were run/); // the fixture also adds a manual adjustment
  });

  it('says the draft was not graded when the student wrote code but never pressed Submit and drafts are not graded', async () => {
    const answers = [{ questionId: 'code', selectedOptionIds: [], textResponse: encodeCodeDraft(CodeLanguage.JAVA, 'class Main {}') }];
    const { service } = setup(true, { finals: [noCodeFinal()], answers, gradeUnsubmittedCode: false });
    const analysis = (await service.get('alice', 'exam')).questions[1].analysis!;
    expect(analysis.reason).toMatch(/^Code was not submitted; saved drafts do not receive marks for this exam/);
    expect(analysis.tests).toHaveLength(2);
  });

  it('shows a draft graded in its own language with its test results when drafts are graded', async () => {
    const draftFinal = { ...noCodeFinal('java'), id: 'draft', code: 'class Main {}', passed: 1, total: 2, resultsJson: [
      { testCaseId: 'sample', verdict: TestCaseVerdict.PASSED, timeMs: 4, stdout: '1', stderr: '' },
      { testCaseId: 'hidden', verdict: TestCaseVerdict.WRONG_ANSWER, timeMs: 5, stdout: 'x', stderr: '' },
    ] };
    const answers = [{ questionId: 'code', selectedOptionIds: [], textResponse: encodeCodeDraft(CodeLanguage.JAVA, 'class Main {}') }];
    const { service } = setup(true, { finals: [draftFinal], answers, gradeUnsubmittedCode: true });
    const row = (await service.get('alice', 'exam')).questions[1];
    expect(row.code).toMatchObject({ code: 'class Main {}', language: 'java', fromDraft: true, submittedAt: null });
    expect(row.analysis!.tests!.map((t) => [t.isSample, t.verdict, t.input])).toEqual([
      [true, TestCaseVerdict.PASSED, '1'],
      [false, TestCaseVerdict.WRONG_ANSWER, 'SECRET'],
    ]);
    expect(row.analysis!.reason).toMatch(/^1 of 2 tests failed/);
  });
});
