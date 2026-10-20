// [SHARED — Day 1 contract] Domain events crossing module boundaries.
// Only these three events exist. Add a new one only by agreement; add your
// listener in your own module with @OnEvent(EVENT_NAME, { async: true }).
//
// Emit AFTER the transaction that caused the event has committed, so a
// listener never observes rows that may still roll back.

/** Person A emits when an exam is published to its registered students. */
export const EXAM_PUBLISHED = 'exam.published';

/** Person C emits when an attempt is finalized (manual submit, expiry, or sweep). */
export const ATTEMPT_SUBMITTED = 'attempt.submitted';

/** Person C emits when an exam (or one student's attempt) gets extra time. */
export const EXAM_EXTENDED = 'exam.extended';

export interface ExamPublishedEvent {
  examId: string;
  publishedAt: Date;
  /** users.id of the admin who published. */
  actorId: string;
}

export interface AttemptSubmittedEvent {
  attemptId: string;
  examId: string;
  /** users.id (JWT sub) of the student — same as attempts.studentId. */
  studentId: string;
  isAutoSubmitted: boolean;
  submittedAt: Date;
}

export interface ExamExtendedEvent {
  extensionId: string;
  examId: string;
  /** users.id of the one extended student, or null for the whole exam. */
  studentId: string | null;
  minutes: number;
  actorId: string;
}
