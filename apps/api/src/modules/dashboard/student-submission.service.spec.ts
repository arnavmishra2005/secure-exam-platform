import { NotFoundException } from '@nestjs/common';
import { AttemptStatus, CodeSubmissionStatus, QuestionType, TestCaseVerdict } from '@secure-exam/types';
import { StudentSubmissionService } from './student-submission.service';

function setup(published = false) {
  const date = new Date('2026-11-01T10:00:00Z');
  const attempt = { id: 'attempt', studentId: 'alice', submittedAt: date };
  const repos: Record<string, any> = {
    AttemptEntity: { findOne: jest.fn(async ({ where }) => where.studentId === 'alice' ? attempt : null) },
    ExamEntity: { findOne: jest.fn(async () => ({ title: 'Exam', gradeUnsubmittedCode: false, passPercentage: 40, passMarkEnabled: false })) },
    AnswerEntity: { find: jest.fn(async () => [{ questionId: 'mcq', selectedOptionIds: ['wrong'], markedForReview: true }]) },
    ResultEntity: { findOne: jest.fn(async () => ({ published, score: 4, maxScore: 10 })) },
    CodeSubmissionEntity: { find: jest.fn(async () => [{ id: 'sub', questionId: 'code', code: 'print(1)', language: 'python', isFinal: true, fromDraft: false, status: CodeSubmissionStatus.GRADED, createdAt: date, passed: 1, total: 2, resultsJson: [
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
});
