/**
 * Owner: Person C (Attempt / Answer / Submission / Monitoring)
 *
 * Plain interface/enum declarations only — no logic — per the file-structure
 * doc's rule for packages/types. Both apps/api and apps/admin-web import
 * from here so entity shapes never drift between backend and admin portal.
 */

export enum AttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  AUTO_SUBMITTED = 'AUTO_SUBMITTED',
}

export enum QuestionState {
  NOT_VISITED = 'NOT_VISITED',
  VISITED = 'VISITED',
  ANSWERED = 'ANSWERED',
  MARKED_REVIEW = 'MARKED_REVIEW',
  ANSWERED_AND_MARKED_REVIEW = 'ANSWERED_AND_MARKED_REVIEW',
}

export interface Attempt {
  id: string;
  /** Person B's Exam.id — referenced by ID only. */
  examId: string;
  /** Person A's Student.id — referenced by ID only. */
  studentId: string;
  status: AttemptStatus;
  /** ISO 8601 */
  startedAt: string;
  /** ISO 8601 — server-authoritative, never derived from client input. */
  expiresAt: string;
  /** ISO 8601, or null while still in progress. */
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Derived, read-only view used by the admin "Live Monitoring" screen.
 * Not persisted — computed per-request from Attempt + ExamSession.
 */
export interface AttemptMonitorView extends Attempt {
  /** Seconds left on the server-authoritative timer; 0 once expired. */
  remainingSeconds: number;
  /** Last heartbeat timestamp (ISO 8601) seen for this attempt, or null. */
  lastSeenAt: string | null;
  /**
   * True when status is still IN_PROGRESS but remainingSeconds has already
   * reached 0 — the timer has run out but nothing has finalized the row
   * yet. Lets the admin UI show "closing out" instead of implying the
   * attempt is live.
   */
  isOverdue: boolean;
}
