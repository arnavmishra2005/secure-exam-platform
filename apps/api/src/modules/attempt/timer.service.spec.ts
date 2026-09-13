import { TimerService } from './timer.service';

describe('TimerService', () => {
  let timer: TimerService;

  beforeEach(() => {
    timer = new TimerService();
  });

  describe('isAttemptValid', () => {
    it('returns true when now is before expiresAt', () => {
      const now = new Date('2026-01-01T10:00:00Z');
      const expiresAt = new Date('2026-01-01T10:30:00Z');
      expect(timer.isAttemptValid(now, expiresAt)).toBe(true);
    });

    it('returns true when now exactly equals expiresAt', () => {
      const t = new Date('2026-01-01T10:30:00Z');
      expect(timer.isAttemptValid(t, t)).toBe(true);
    });

    it('returns false when now is after expiresAt', () => {
      const now = new Date('2026-01-01T10:31:00Z');
      const expiresAt = new Date('2026-01-01T10:30:00Z');
      expect(timer.isAttemptValid(now, expiresAt)).toBe(false);
    });

    it('is driven only by the two timestamps given — never a client-supplied clock', () => {
      // Simulates a client claiming a different "now" than the server's own clock:
      // the service has no way to know or care, which is exactly the point.
      const serverNow = new Date('2026-01-01T11:00:00Z');
      const expiresAt = new Date('2026-01-01T10:30:00Z');
      expect(timer.isAttemptValid(serverNow, expiresAt)).toBe(false);
    });
  });

  describe('computeExpiresAt', () => {
    it('adds durationMinutes to startedAt when within the exam window', () => {
      const startedAt = new Date('2026-01-01T10:00:00Z');
      const examEnd = new Date('2026-01-01T12:00:00Z');
      const result = timer.computeExpiresAt(startedAt, 30, examEnd);
      expect(result).toEqual(new Date('2026-01-01T10:30:00Z'));
    });

    it('clamps to the exam end time when the full duration would exceed it', () => {
      const startedAt = new Date('2026-01-01T11:50:00Z');
      const examEnd = new Date('2026-01-01T12:00:00Z');
      const result = timer.computeExpiresAt(startedAt, 30, examEnd);
      expect(result).toEqual(examEnd);
    });

    it('returns exactly the exam end time when starting exactly on the boundary', () => {
      const startedAt = new Date('2026-01-01T12:00:00Z');
      const examEnd = new Date('2026-01-01T12:00:00Z');
      const result = timer.computeExpiresAt(startedAt, 30, examEnd);
      expect(result).toEqual(examEnd);
    });
  });

  describe('remainingSeconds', () => {
    it('computes whole seconds remaining', () => {
      const now = new Date('2026-01-01T10:00:00Z');
      const expiresAt = new Date('2026-01-01T10:01:30Z');
      expect(timer.remainingSeconds(now, expiresAt)).toBe(90);
    });

    it('never returns a negative number once expired', () => {
      const now = new Date('2026-01-01T10:05:00Z');
      const expiresAt = new Date('2026-01-01T10:00:00Z');
      expect(timer.remainingSeconds(now, expiresAt)).toBe(0);
    });
  });
});
