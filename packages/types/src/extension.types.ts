/**
 * Owner: Person C (Time Extension, Dashboard)
 *
 * Extending an exam for everyone pushes the exam's end time and every
 * running attempt's expiry. Extending it for one student pushes only that
 * student's attempt (or, if they haven't started, is applied when they do).
 */

import type { AttemptStatus } from './attempt.types';

export enum ExtensionScope {
  ALL = 'ALL',
  STUDENT = 'STUDENT',
}

export interface ExamExtension {
  id: string;
  examId: string;
  scope: ExtensionScope;
  /** users.id of the student when scope is STUDENT, otherwise null. */
  studentId: string | null;
  minutes: number;
  reason: string | null;
  /** users.id of the admin who granted it. */
  createdBy: string;
  /** Running attempts whose expiry was pushed when this was granted. */
  affectedAttempts: number;
  createdAt: string;
}

export interface ExtendTimeRequest {
  minutes: number;
  /**
   * users.id of the student to extend, or omitted to extend the whole exam.
   * A students.id is also accepted and resolved server-side.
   */
  studentId?: string;
  reason?: string;
}

/** Response of POST /attempts/:id/heartbeat — the client's clock source. */
export interface HeartbeatResponse {
  /** Server time when the heartbeat was handled (ISO 8601). */
  serverTime: string;
  /** Current server-authoritative expiry, including any extensions. */
  expiresAt: string;
  remainingSeconds: number;
  status: AttemptStatus;
}
