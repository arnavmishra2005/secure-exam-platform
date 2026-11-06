import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AttemptStatus, AuditEventType, QuestionCellState, QuestionType, ScoreSource } from '@secure-exam/types';
import { AdjustQuestionScoreDto } from '@secure-exam/validation';
import { applyAdjustment } from './matrix';
import { ScoreAdjustmentService } from './score-adjustment.service';

/** #13 manual mark adjustment. */

const question = { id: 'q-1', text: 'Q', type: QuestionType.CODING, marks: 10, options: [] };
const attempt = { attemptId: 'att-1', studentId: 'stu-1', status: AttemptStatus.SUBMITTED };
const cell = (score: number | null) => ({
  attemptId: 'att-1',
  questionId: 'q-1',
  state: score === null ? QuestionCellState.PENDING : QuestionCellState.PARTIAL,
  score,
  maxScore: 10,
  markedForReview: false,
});

function setup(opts: { auto?: number | null; existing?: Record<string, unknown> | null; status?: AttemptStatus } = {}) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(opts.existing ?? null),
    update: jest.fn().mockResolvedValue({}),
    insert: jest.fn().mockResolvedValue({}),
  };
  const manager = { getRepository: () => repo };
  const dataSource = { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
  const analytics = {
    autoCell: jest.fn().mockResolvedValue({
      attempt: { ...attempt, status: opts.status ?? AttemptStatus.SUBMITTED },
      question,
      cell: cell(opts.auto === undefined ? 6 : opts.auto),
    }),
    attemptTotal: jest.fn().mockResolvedValue(42),
    userNames: jest.fn().mockResolvedValue(new Map([['admin-1', 'Ada Admin']])),
  };
  const totals = { recompute: jest.fn().mockResolvedValue(undefined) };
  const audit = { logEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new ScoreAdjustmentService(dataSource as never, analytics as never, totals as never, audit as never);
  return { service, repo, totals, audit, manager };
}

describe('ScoreAdjustmentService', () => {
  it('sets a new mark: stores it as an adjustment on top of the automatic score and recomputes the total', async () => {
    const { service, repo, totals, audit, manager } = setup({ existing: { id: 'qs-1', score: 6, manualAdjustment: 0 } });
    const res = await service.adjust('exam-1', 'att-1', 'q-1', { score: 8, reason: 'Correct idea, off-by-one in output' }, 'admin-1');

    expect(repo.update).toHaveBeenCalledWith(
      { id: 'qs-1' },
      expect.objectContaining({ autoScore: 6, manualAdjustment: 2, score: 8, adjustedBy: 'admin-1', adjustReason: 'Correct idea, off-by-one in output' }),
    );
    expect(totals.recompute).toHaveBeenCalledWith(manager, 'exam-1', 'att-1');
    expect(res).toMatchObject({ autoScore: 6, score: 8, maxScore: 10, total: 42, adjustment: { adjustment: 2, adjustedByName: 'Ada Admin' } });
    expect(audit.logEvent).toHaveBeenCalledWith(
      AuditEventType.SCORE_ADJUSTED,
      expect.objectContaining({ examId: 'exam-1', attemptId: 'att-1', questionId: 'q-1', oldScore: 6, newScore: 8, oldAdjustment: 0, newAdjustment: 2 }),
      'admin-1',
    );
  });

  it('takes marks away with a negative adjustment, and inserts a row when grading left none', async () => {
    const { service, repo } = setup();
    const res = await service.adjust('exam-1', 'att-1', 'q-1', { adjustment: -1.5, reason: 'Hard-coded the sample output' }, 'admin-1');
    expect(res.score).toBe(4.5);
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: 'att-1', studentId: 'stu-1', source: ScoreSource.AUTO_CODE, autoScore: 6, manualAdjustment: -1.5, score: 4.5, maxScore: 10 }),
    );
  });

  it('removes an adjustment with 0, still recording the reason in the audit log', async () => {
    const { service, repo, audit } = setup({ existing: { id: 'qs-1', score: 8, manualAdjustment: 2 } });
    const res = await service.adjust('exam-1', 'att-1', 'q-1', { adjustment: 0, reason: 'Re-checked: automatic mark was right' }, 'admin-1');
    expect(res.adjustment).toBeNull();
    expect(repo.update).toHaveBeenCalledWith({ id: 'qs-1' }, expect.objectContaining({ manualAdjustment: 0, score: 6, adjustReason: null, adjustedBy: null }));
    expect(audit.logEvent).toHaveBeenCalledWith(
      AuditEventType.SCORE_ADJUSTED,
      expect.objectContaining({ oldScore: 8, newScore: 6, reason: 'Re-checked: automatic mark was right' }),
      'admin-1',
    );
  });

  it.each([
    [{ score: 11, reason: 'x' }, BadRequestException, /between 0 and 10/],
    [{ adjustment: -7, reason: 'x' }, BadRequestException, /between 0 and 10/],
    [{ score: 5, adjustment: 1, reason: 'x' }, BadRequestException, /not both/],
    [{ reason: 'x' }, BadRequestException, /not both/],
    [{ score: 5, reason: '   ' }, BadRequestException, /reason/],
  ])('refuses %j', async (dto, type, message) => {
    const { service, repo } = setup();
    await expect(service.adjust('exam-1', 'att-1', 'q-1', dto as never, 'admin-1')).rejects.toThrow(type);
    await expect(service.adjust('exam-1', 'att-1', 'q-1', dto as never, 'admin-1')).rejects.toThrow(message);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('waits for grading and for the attempt to finish', async () => {
    await expect(setup({ auto: null }).service.adjust('e', 'a', 'q', { score: 5, reason: 'x' }, 'u')).rejects.toThrow(ConflictException);
    await expect(
      setup({ status: AttemptStatus.IN_PROGRESS }).service.adjust('e', 'a', 'q', { score: 5, reason: 'x' }, 'u'),
    ).rejects.toThrow(/hasn't finished/);
  });
});

describe('applyAdjustment', () => {
  it('adds the adjustment within 0…max and keeps the automatic score visible', () => {
    expect(applyAdjustment(cell(6), 2)).toMatchObject({ score: 8, autoScore: 6, adjustment: 2 });
    expect(applyAdjustment(cell(6), 9).score).toBe(10);
    expect(applyAdjustment(cell(6), -9).score).toBe(0);
    expect(applyAdjustment(cell(6), 0)).toEqual(cell(6));
    expect(applyAdjustment(cell(null), 2)).toEqual(cell(null)); // not graded yet
  });
});

describe('AdjustQuestionScoreDto', () => {
  const errors = async (plain: Record<string, unknown>) =>
    (await validate(plainToInstance(AdjustQuestionScoreDto, plain))).map((e) => e.property);

  it('needs a reason and numbers with at most 2 decimals', async () => {
    expect(await errors({ score: 7.25, reason: ' fair ' })).toEqual([]);
    expect(await errors({ adjustment: -1, reason: 'x' })).toEqual([]);
    expect(await errors({ score: 7, reason: '  ' })).toEqual(['reason']);
    expect(await errors({ score: 7.125, reason: 'x' })).toEqual(['score']);
    expect(await errors({ score: -1, reason: 'x' })).toEqual(['score']);
  });
});
