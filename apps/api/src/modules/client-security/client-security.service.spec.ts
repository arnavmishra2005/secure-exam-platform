// Owner: Person C (Electron, Kiosk & Security)

import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { ClientSecurityService } from './client-security.service';
import { SecurityEventEntity } from './entities/security-event.entity';

const STUDENT = { sub: 'student-1', email: 's@x.dev', role: 'student' } as never;
const attempt = { id: 'attempt-1', examId: 'exam-1', studentId: 'student-1' };
const batch = (n: number) => ({
  events: Array.from({ length: n }, (_, i) => ({
    type: 'BLOCKED_SHORTCUT' as const,
    detail: `Cmd+R #${i}`,
    occurredAt: '2026-10-21T10:00:00.000Z',
  })),
});

describe('ClientSecurityService', () => {
  let service: ClientSecurityService;
  let events: { insert: jest.Mock; count: jest.Mock; find: jest.Mock; createQueryBuilder: jest.Mock };
  let attempts: { findOne: jest.Mock };
  let audit: { logEvent: jest.Mock };

  beforeEach(async () => {
    events = { insert: jest.fn(), count: jest.fn().mockResolvedValue(0), find: jest.fn(), createQueryBuilder: jest.fn() };
    attempts = { findOne: jest.fn().mockResolvedValue(attempt) };
    audit = { logEvent: jest.fn().mockResolvedValue({}) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientSecurityService,
        { provide: getRepositoryToken(SecurityEventEntity), useValue: events },
        { provide: getRepositoryToken(AttemptEntity), useValue: attempts },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();
    service = moduleRef.get(ClientSecurityService);
  });

  describe('record', () => {
    it("stores the student's events with the attempt's exam id and writes one audit line", async () => {
      await expect(service.record('attempt-1', STUDENT, batch(2) as never)).resolves.toEqual({ recorded: 2 });

      const rows = events.insert.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ attemptId: 'attempt-1', examId: 'exam-1', studentId: 'student-1', type: 'BLOCKED_SHORTCUT' });
      expect(audit.logEvent).toHaveBeenCalledTimes(1);
      expect(audit.logEvent.mock.calls[0][1]).toMatchObject({ examId: 'exam-1', attemptId: 'attempt-1', count: 2 });
    });

    it("answers 404 for someone else's attempt, so its existence is not revealed", async () => {
      await expect(service.record('attempt-1', { ...(STUDENT as object), sub: 'student-2' } as never, batch(1) as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(events.insert).not.toHaveBeenCalled();
    });

    it('answers 404 for an attempt that does not exist', async () => {
      attempts.findOne.mockResolvedValue(null);
      await expect(service.record('nope', STUDENT, batch(1) as never)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('stops storing once an attempt has 2000 events', async () => {
      events.count.mockResolvedValue(1999);
      await expect(service.record('attempt-1', STUDENT, batch(5) as never)).resolves.toEqual({ recorded: 1 });
      expect(events.insert.mock.calls[0][0]).toHaveLength(1);

      events.insert.mockClear();
      events.count.mockResolvedValue(2000);
      await expect(service.record('attempt-1', STUDENT, batch(5) as never)).resolves.toEqual({ recorded: 0 });
      expect(events.insert).not.toHaveBeenCalled();
    });

    it('still stores the events when the audit line cannot be written', async () => {
      audit.logEvent.mockRejectedValue(new Error('audit down'));
      await expect(service.record('attempt-1', STUDENT, batch(1) as never)).resolves.toEqual({ recorded: 1 });
    });
  });

  describe('countByAttempt', () => {
    it('does not query for an empty list', async () => {
      await expect(service.countByAttempt([])).resolves.toEqual(new Map());
      expect(events.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('turns the grouped rows into a map of numbers', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ attemptId: 'a1', count: '3' }]),
      };
      events.createQueryBuilder.mockReturnValue(qb);
      const counts = await service.countByAttempt(['a1', 'a2']);
      expect(counts.get('a1')).toBe(3);
      expect(counts.get('a2')).toBeUndefined();
    });
  });

  it('flags at 5 violations by default', () => {
    expect(service.flagThreshold()).toBe(5);
  });
});
