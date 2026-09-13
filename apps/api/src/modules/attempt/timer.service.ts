import { Injectable } from '@nestjs/common';

/**
 * Owner: Person C.
 *
 * Pure, dependency-free server-side timer authority. The client's clock is
 * NEVER trusted for expiry decisions — every check here runs off the
 * server's own `Date` and the attempt's persisted `expiresAt`.
 *
 * Deliberately built with zero NestJS DI dependencies (no repositories, no
 * other services) so it's trivial to unit test in isolation, and so it can
 * be developed/tested before the Exam module (Person B) exists — it only
 * ever needs an `expiresAt` timestamp, never the full Exam entity. Per the
 * task-breakdown doc: "a good place to start before Exam module (Person B)
 * is finished."
 */
@Injectable()
export class TimerService {
  /** True while `now` is still within the attempt's allowed window. */
  isAttemptValid(now: Date, expiresAt: Date): boolean {
    return now.getTime() <= expiresAt.getTime();
  }

  /**
   * expiresAt = min(startedAt + durationMinutes, examEndTime).
   *
   * Ensures an attempt can never run past the exam's own scheduled window,
   * even if the student starts with little time left before the exam
   * closes.
   */
  computeExpiresAt(startedAt: Date, durationMinutes: number, examEndTime: Date): Date {
    const byDuration = new Date(startedAt.getTime() + durationMinutes * 60_000);
    return byDuration.getTime() < examEndTime.getTime() ? byDuration : examEndTime;
  }

  /** Whole seconds remaining; never negative. */
  remainingSeconds(now: Date, expiresAt: Date): number {
    return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  }
}
