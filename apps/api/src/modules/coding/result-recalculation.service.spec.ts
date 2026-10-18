import { NotFoundException } from '@nestjs/common';
import { CodeSubmissionStatus, QuestionType, TestCaseVerdict } from '@secure-exam/types';
import { ResultRecalculationService } from './result-recalculation.service';

const P = TestCaseVerdict.PASSED;
const F = TestCaseVerdict.WRONG_ANSWER;

function setup() {
  const attempts = {
    listFinishedAttempts: jest.fn().mockResolvedValue([
      { attemptId: 'a1', examId: 'e1', studentId: 's1', submittedAt: new Date() },
      { attemptId: 'a2', examId: 'e1', studentId: 's2', submittedAt: new Date() },
    ]),
  };
  const examRepo = { exist: jest.fn().mockResolvedValue(true) };
  const questions = [
    { id: 'mcq', text: 'm', type: QuestionType.MCQ_SINGLE, marks: 2, options: [] },
    { id: 'code', text: 'c', type: QuestionType.CODING, marks: 20, options: [] },
  ];
  const totals = {
    examQuestions: jest.fn().mockResolvedValue(questions),
    recompute: jest.fn().mockResolvedValue(undefined),
  };
  const resolver = {
    allTests: jest.fn().mockResolvedValue([
      { id: 't1', weight: 1 },
      { id: 't2', weight: 3 },
    ]),
  };
  const finals: object[] = [];
  const queued = new Set<string>();
  const repo = {
    find: jest.fn(async () => finals),
    update: jest.fn(async (where: { id: string }, patch: { status?: string }) => {
      if (patch.status === CodeSubmissionStatus.PENDING) {
        const f = finals.find((x) => (x as { id: string }).id === where.id) as { attemptId: string };
        queued.add(f.attemptId);
      }
    }),
    count: jest.fn(async ({ where }: { where: { attemptId: string } }) => (queued.has(where.attemptId) ? 1 : 0)),
  };
  const manager = { getRepository: () => repo };
  const dataSource = { transaction: (cb: (m: unknown) => Promise<unknown>) => cb(manager) };
  const auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new ResultRecalculationService(
    attempts as never,
    examRepo as never,
    dataSource as never,
    resolver as never,
    totals as never,
    auditService as never,
  );
  return { service, finals, repo, totals, examRepo, auditService };
}

const final = (id: string, attemptId: string, testIds: string[], verdicts: TestCaseVerdict[], code = 'print(1)') => ({
  id,
  attemptId,
  questionId: 'code',
  isFinal: true,
  status: CodeSubmissionStatus.GRADED,
  code,
  resultsJson: testIds.map((testCaseId, i) => ({ testCaseId, verdict: verdicts[i], weight: 1 })),
});

describe('ResultRecalculationService', () => {
  it('rescales coding scores from stored verdicts when the tests are unchanged (marks edited)', async () => {
    const { service, finals, repo, totals } = setup();
    finals.push(final('f1', 'a1', ['t1', 't2'], [P, F]), final('f2', 'a2', ['t2', 't1'], [P, P]));

    const res = await service.recalculate('e1', undefined, 'admin');

    // current weights: t1=1, t2=3 → a1 passed weight 1/4 of 20 marks = 5; a2 all = 20
    expect(repo.update).toHaveBeenCalledWith({ id: 'f1' }, { score: 5, maxScore: 20 });
    expect(repo.update).toHaveBeenCalledWith({ id: 'f2' }, { score: 20, maxScore: 20 });
    expect(totals.recompute).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ attempts: 2, recalculatedNow: 2, queuedToRerun: 0 });
  });

  it('queues answers to run again when the tests changed, and recomputes only the others now', async () => {
    const { service, finals, repo, totals } = setup();
    finals.push(final('f1', 'a1', ['old-1', 'old-2'], [P, P]), final('f2', 'a2', ['t1', 't2'], [P, P]));

    const res = await service.recalculate('e1', undefined, 'admin');

    expect(repo.update).toHaveBeenCalledWith({ id: 'f1' }, { status: CodeSubmissionStatus.PENDING });
    expect(totals.recompute).toHaveBeenCalledTimes(1);
    expect(totals.recompute).toHaveBeenCalledWith(expect.anything(), 'e1', 'a2', expect.any(Array));
    expect(res).toEqual({ attempts: 2, recalculatedNow: 1, queuedToRerun: 1 });
  });

  it('keeps "no code" answers at 0 with the new maximum', async () => {
    const { service, finals, repo } = setup();
    finals.push(final('f1', 'a1', [], [], '   '));
    await service.recalculate('e1', undefined, 'admin');
    expect(repo.update).toHaveBeenCalledWith({ id: 'f1' }, { maxScore: 20, score: 0 });
  });

  it('recomputes MCQ-only changes without touching code answers when scoped to an MCQ', async () => {
    const { service, finals, repo, totals } = setup();
    finals.push(final('f1', 'a1', ['old'], [P]));
    const res = await service.recalculate('e1', 'mcq', 'admin');
    expect(repo.find).not.toHaveBeenCalled();
    expect(totals.recompute).toHaveBeenCalledTimes(2);
    expect(res.queuedToRerun).toBe(0);
  });

  it('404s for an unknown exam or a question outside the exam', async () => {
    const { service, examRepo } = setup();
    await expect(service.recalculate('e1', 'nope', 'admin')).rejects.toBeInstanceOf(NotFoundException);
    examRepo.exist.mockResolvedValue(false);
    await expect(service.recalculate('e1', undefined, 'admin')).rejects.toBeInstanceOf(NotFoundException);
  });
});
