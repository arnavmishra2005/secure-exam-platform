// What a registered student can do with an exam right now, in plain words.
//
// The API's state says UPCOMING both before the start time and after it, while
// staff haven't opened (started) the exam yet. Those need different messages:
// "starts in 2h" before, and "waiting for your instructor to open it" after
// (never "opens 5m ago").

import { AttemptStatus, StudentExamState } from '@secure-exam/types';
import type { StudentExamView } from '@secure-exam/types';

export type StudentExamPhase =
  /** Published; the start time is still ahead. */
  | 'scheduled'
  /** The start time has passed, but staff haven't opened the exam yet. */
  | 'waiting'
  /** Open: the student can start it now. */
  | 'open'
  /** The student's attempt is running. */
  | 'in-progress'
  | 'completed'
  | 'missed';

type ExamTimes = Pick<StudentExamView, 'state' | 'attemptStatus' | 'startTime' | 'endTime' | 'durationMinutes' | 'extendedMinutes'>;

export function studentExamPhase(exam: ExamTimes, now = Date.now()): StudentExamPhase {
  if (exam.attemptStatus === AttemptStatus.IN_PROGRESS) return 'in-progress';
  switch (exam.state) {
    case StudentExamState.LIVE:
      return 'open';
    case StudentExamState.COMPLETED:
      return 'completed';
    case StudentExamState.MISSED:
      return 'missed';
    default:
      return new Date(exam.startTime).getTime() <= now ? 'waiting' : 'scheduled';
  }
}

/** The exam's full time, including extra minutes granted to this student. */
export function fullMinutes(exam: ExamTimes): number {
  return exam.durationMinutes + (exam.extendedMinutes ?? 0);
}

/**
 * Minutes a student who starts now would get: the full time, unless the exam
 * window closes sooner (the timer stops at the window's end).
 */
export function minutesIfStartedNow(exam: ExamTimes, now = Date.now()): number {
  const untilClose = Math.floor((new Date(exam.endTime).getTime() - now) / 60_000);
  return Math.max(0, Math.min(fullMinutes(exam), untilClose));
}

/** The last moment to start and still get the full time (ISO). */
export function latestFullStart(exam: ExamTimes): string {
  return new Date(new Date(exam.endTime).getTime() - fullMinutes(exam) * 60_000).toISOString();
}
