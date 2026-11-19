// Owner: Person C (Electron, Kiosk & Security)

import { ForbiddenException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { ExamLaunchTokenEntity } from './entities/exam-launch-token.entity';
import { ExamLaunchService } from './exam-launch.service';

const STUDENT_JWT = { sub: 'user-1', email: 'a@x.dev', role: 'student' } as never;
const TOKEN = 'A'.repeat(43);
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('ExamLaunchService', () => {
  let service: ExamLaunchService;
  let tokens: { insert: jest.Mock; createQueryBuilder: jest.Mock; update: jest.Mock; manager: unknown };
  let attemptRow: Record<string, unknown> | null;
  let attempts: { update: jest.Mock; createQueryBuilder: jest.Mock };
  let events: { insert: jest.Mock };
  let users: { findById: jest.Mock };
  let auth: { startSessionForUser: jest.Mock };
  let qb: Record<string, jest.Mock>;
  /** What the raw queries answer: did the student leave through Ctrl+Alt+Delete, and the old device's last heartbeat. */
  let db: { interrupted: boolean; lastSeen: Date | null };

  beforeEach(async () => {
    qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    attemptRow = null;
    db = { interrupted: false, lastSeen: null };
    const aq = { addSelect: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne: jest.fn(async () => attemptRow) };
    attempts = { createQueryBuilder: jest.fn(() => aq), update: jest.fn(async (_id, values) => Object.assign(attemptRow!, values)) };
    events = { insert: jest.fn() };
    tokens = { insert: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(qb), update: jest.fn(), manager: { transaction: async (work: (m: unknown) => unknown) => work({
      getRepository: (e: { name: string }) => e.name === 'AttemptEntity' ? attempts : e.name === 'SecurityEventEntity' ? events : tokens,
      query: jest.fn(async (sql: string) => (sql.includes('security_events') ? [{ interrupted: db.interrupted }] : [{ lastSeen: db.lastSeen }])),
    }) } };
    users = { findById: jest.fn() };
    auth = { startSessionForUser: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: { id: 'user-1' } }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExamLaunchService,
        { provide: getRepositoryToken(ExamLaunchTokenEntity), useValue: tokens },
        { provide: UserService, useValue: users },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();
    service = moduleRef.get(ExamLaunchService);
  });

  describe('create', () => {
    it('returns a 43-character token and stores only its hash', async () => {
      const { token, expiresInSeconds } = await service.create(STUDENT_JWT, 'exam-1');

      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(expiresInSeconds).toBe(120);
      const stored = tokens.insert.mock.calls[0][0];
      expect(stored.tokenHash).toBe(sha256(token));
      expect(JSON.stringify(stored)).not.toContain(token);
      expect(stored).toMatchObject({ userId: 'user-1', examId: 'exam-1' });
      expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 100_000);
    });

    it('never hands out the same token twice', async () => {
      const a = await service.create(STUDENT_JWT, 'exam-1');
      const b = await service.create(STUDENT_JWT, 'exam-1');
      expect(a.token).not.toBe(b.token);
    });
  });

  describe('preview', () => {
    it('shows who the token belongs to without using it', async () => {
      qb.getOne.mockResolvedValue({ userId: 'user-1', examId: 'exam-1' });
      users.findById.mockResolvedValue({ email: 'alice@x.dev', fullName: 'Alice' });

      await expect(service.preview(TOKEN)).resolves.toEqual({ email: 'alice@x.dev', fullName: 'Alice', examId: 'exam-1' });
      expect(qb.where.mock.calls[0][1]).toEqual({ hash: sha256(TOKEN) });
      expect(qb.update).not.toHaveBeenCalled();
    });

    it('answers 410 for an unknown, used or expired token', async () => {
      qb.getOne.mockResolvedValue(null);
      await expect(service.preview(TOKEN)).rejects.toBeInstanceOf(GoneException);
    });
  });

  describe('redeem', () => {
    const live = { id: 'token-1', tokenHash: sha256(TOKEN), userId: 'user-1', examId: 'exam-1' };

    it('uses the token up and starts a session for the exam', async () => {
      qb.getOne.mockResolvedValue(live);
      users.findById.mockResolvedValue({ id: 'user-1', email: 'a@x.dev', fullName: 'A', role: 'student', isActive: true });

      const session = await service.redeem(TOKEN, '1.2.3.4');

      expect(session).toMatchObject({ accessToken: 'a', refreshToken: 'r', examId: 'exam-1' });
      expect(auth.startSessionForUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), '1.2.3.4', {
        via: 'exam-launch',
        examId: 'exam-1',
      }, { examId: 'exam-1', examSessionId: session.examSessionId });
      expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(tokens.update).toHaveBeenCalledWith('token-1', { usedAt: expect.any(Date) });
      expect(qb.where.mock.calls[0][0]).toContain('t.usedAt IS NULL');
      expect(qb.where.mock.calls[0][0]).toContain('t.expiresAt > now()');
    });

    it('answers 410 when no row matched (already used, expired or unknown)', async () => {
      qb.getOne.mockResolvedValue(null);
      await expect(service.redeem(TOKEN, null)).rejects.toBeInstanceOf(GoneException);
      expect(auth.startSessionForUser).not.toHaveBeenCalled();
    });

    it('commits a pending request, preserves the old session, and consumes only after approval', async () => {
      qb.getOne.mockResolvedValue(live);
      users.findById.mockResolvedValue({ id: 'user-1', role: 'student', isActive: true });
      attemptRow = { id: 'attempt-1', examId: 'exam-1', studentId: 'user-1', status: 'IN_PROGRESS', expiresAt: new Date(Date.now()+600000), activeSessionId: 'old' };
      await expect(service.redeem(TOKEN, null)).rejects.toMatchObject({ response: { code: 'DEVICE_CHANGE_PENDING' } });
      expect(attemptRow.activeSessionId).toBe('old');
      expect(auth.startSessionForUser).not.toHaveBeenCalled();
      expect(tokens.update).not.toHaveBeenCalledWith('token-1', expect.objectContaining({ usedAt: expect.anything() }));
      tokens.update.mockClear();
      await expect(service.redeem(TOKEN, null)).rejects.toMatchObject({ response: { code: 'DEVICE_CHANGE_PENDING' } });
      expect(tokens.update).not.toHaveBeenCalled();
      attemptRow.deviceChangeApprovedAt = new Date();
      const result = await service.redeem(TOKEN, null);
      expect(attemptRow.activeSessionId).toBe(result.examSessionId);
      expect(attemptRow.deviceChangeTokenHash).toBeNull();
      expect(events.insert).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEVICE_CHANGED' }));
    });

    describe('the timer during an approved device change', () => {
      const MIN = 60_000;
      const approveAndContinue = async () => {
        attemptRow!.deviceChangeApprovedAt = new Date();
        return service.redeem(TOKEN, null);
      };
      beforeEach(() => {
        qb.getOne.mockResolvedValue(live);
        users.findById.mockResolvedValue({ id: 'user-1', role: 'student', isActive: true });
      });

      it('stops where the student left off and continues from there on the new device', async () => {
        const now = Date.now();
        db.lastSeen = new Date(now - 4 * MIN); // the old PC's last heartbeat
        attemptRow = { id: 'attempt-1', examId: 'exam-1', studentId: 'user-1', status: 'IN_PROGRESS', startedAt: new Date(now - 30 * MIN),
          expiresAt: new Date(now + 10 * MIN), activeSessionId: 'old', deviceChangeRequestedAt: null };

        await expect(service.redeem(TOKEN, null)).rejects.toMatchObject({ response: { code: 'DEVICE_CHANGE_PENDING', timerPaused: true } });
        expect(attemptRow.timerPausedAt).toEqual(db.lastSeen);

        await approveAndContinue();
        expect(attemptRow.timerPausedAt).toBeNull();
        // 14 minutes were left when the student left off: they still are.
        const remaining = (attemptRow.expiresAt as Date).getTime() - Date.now();
        expect(remaining).toBeGreaterThan(14 * MIN - 2_000);
        expect(remaining).toBeLessThanOrEqual(14 * MIN);
      });

      it('keeps running after Ctrl+Alt+Delete (a violation)', async () => {
        const now = Date.now();
        const expiresAt = new Date(now + 10 * MIN);
        db.interrupted = true;
        db.lastSeen = new Date(now - 4 * MIN);
        attemptRow = { id: 'attempt-1', examId: 'exam-1', studentId: 'user-1', status: 'IN_PROGRESS', startedAt: new Date(now - 30 * MIN),
          expiresAt, activeSessionId: 'old', deviceChangeRequestedAt: null };

        await expect(service.redeem(TOKEN, null)).rejects.toMatchObject({ response: { code: 'DEVICE_CHANGE_PENDING', timerPaused: false } });
        expect(attemptRow.timerPausedAt).toBeFalsy();
        await approveAndContinue();
        expect(attemptRow.expiresAt).toEqual(expiresAt);
      });

      it('does not let the clock run out while the student was away', async () => {
        const now = Date.now();
        db.lastSeen = new Date(now - 5 * MIN);
        // Two minutes were left when the PC died; that was three minutes ago.
        attemptRow = { id: 'attempt-1', examId: 'exam-1', studentId: 'user-1', status: 'IN_PROGRESS', startedAt: new Date(now - 30 * MIN),
          expiresAt: new Date(now - 3 * MIN), activeSessionId: 'old', deviceChangeRequestedAt: null };

        await expect(service.redeem(TOKEN, null)).rejects.toMatchObject({ response: { code: 'DEVICE_CHANGE_PENDING', timerPaused: true } });
        await approveAndContinue();
        expect((attemptRow.expiresAt as Date).getTime() - Date.now()).toBeGreaterThan(2 * MIN - 2_000);
      });

      it('gives nothing back for an earlier request that lapsed unapproved', async () => {
        const now = Date.now();
        db.lastSeen = new Date(now - 30 * MIN);
        const lapsedRequest = new Date(now - 15 * MIN); // its 10-minute window ended 5 minutes ago
        attemptRow = { id: 'attempt-1', examId: 'exam-1', studentId: 'user-1', status: 'IN_PROGRESS', startedAt: new Date(now - 60 * MIN),
          expiresAt: new Date(now + 10 * MIN), activeSessionId: 'old', deviceChangeTokenHash: 'other', deviceChangeRequestedAt: lapsedRequest };

        await expect(service.redeem(TOKEN, null)).rejects.toMatchObject({ response: { code: 'DEVICE_CHANGE_PENDING' } });
        expect(attemptRow.timerPausedAt).toEqual(new Date(lapsedRequest.getTime() + 10 * MIN));
      });
    });

    it.each(['instructor', 'ta'])('refuses a %s', async (role) => {
      qb.getOne.mockResolvedValue(live);
      users.findById.mockResolvedValue({ id: 'user-1', role, isActive: true });
      await expect(service.redeem(TOKEN, null)).rejects.toBeInstanceOf(ForbiddenException);
      expect(auth.startSessionForUser).not.toHaveBeenCalled();
    });

    it('refuses a deactivated student', async () => {
      qb.getOne.mockResolvedValue(live);
      users.findById.mockResolvedValue({ id: 'user-1', role: 'student', isActive: false });
      await expect(service.redeem(TOKEN, null)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
