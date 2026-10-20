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
   * expiresAt = min(startedAt + durationMinutes, examEndTime) + extraMinutes.
   *
   * Ensures an attempt can never run past the exam's own scheduled window,
   * even if the student starts with little time left before the exam
   * closes. `extraMinutes` is per-student extra time granted before the
   * student started (Phase 4 extensions); it deliberately applies on top of
   * the cap, since its purpose is to let that one student run past the end.
   * Whole-exam extensions move `examEndTime` itself instead.
   */
  computeExpiresAt(startedAt: Date, durationMinutes: number, examEndTime: Date, extraMinutes = 0): Date {
    const byDuration = startedAt.getTime() + durationMinutes * 60_000;
    const capped = Math.min(byDuration, examEndTime.getTime());
    return new Date(capped + Math.max(0, extraMinutes) * 60_000);
  }

  /** Whole seconds remaining; never negative. */
  remainingSeconds(now: Date, expiresAt: Date): number {
    return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  }
}
