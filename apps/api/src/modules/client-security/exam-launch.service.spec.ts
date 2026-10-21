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
  let tokens: { insert: jest.Mock; createQueryBuilder: jest.Mock };
  let users: { findById: jest.Mock };
  let auth: { startSessionForUser: jest.Mock };
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    tokens = { insert: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(qb) };
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
    const live = { raw: [{ userId: 'user-1', examId: 'exam-1' }] };

    it('uses the token up and starts a session for the exam', async () => {
      qb.execute.mockResolvedValue(live);
      users.findById.mockResolvedValue({ id: 'user-1', email: 'a@x.dev', fullName: 'A', role: 'student', isActive: true });

      const session = await service.redeem(TOKEN, '1.2.3.4');

      expect(session).toMatchObject({ accessToken: 'a', refreshToken: 'r', examId: 'exam-1' });
      expect(auth.startSessionForUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), '1.2.3.4', {
        via: 'exam-launch',
        examId: 'exam-1',
      });
      // The single UPDATE is what makes it one-time: used, unexpired rows only.
      expect(qb.where.mock.calls[0][0]).toContain('"usedAt" IS NULL');
      expect(qb.where.mock.calls[0][0]).toContain('"expiresAt" > now()');
    });

    it('answers 410 when no row matched (already used, expired or unknown)', async () => {
      qb.execute.mockResolvedValue({ raw: [] });
      await expect(service.redeem(TOKEN, null)).rejects.toBeInstanceOf(GoneException);
      expect(auth.startSessionForUser).not.toHaveBeenCalled();
    });

    it('refuses an administrator', async () => {
      qb.execute.mockResolvedValue(live);
      users.findById.mockResolvedValue({ id: 'user-1', role: 'admin', isActive: true });
      await expect(service.redeem(TOKEN, null)).rejects.toBeInstanceOf(ForbiddenException);
      expect(auth.startSessionForUser).not.toHaveBeenCalled();
    });

    it('refuses a deactivated student', async () => {
      qb.execute.mockResolvedValue(live);
      users.findById.mockResolvedValue({ id: 'user-1', role: 'student', isActive: false });
      await expect(service.redeem(TOKEN, null)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
