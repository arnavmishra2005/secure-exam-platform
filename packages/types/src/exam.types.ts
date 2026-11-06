/**
 * Owner: Person B (Exam Content Domain)
 *
 * Plain type/interface declarations only — no logic lives here.
 * Both apps/api and apps/web import from this file so the
 * shape of an Exam never drifts between backend and frontend.
 */

export enum ExamStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

/** Allowed forward transitions for the exam state machine. Enforced in ExamService — never trust the client. */
export const EXAM_STATUS_TRANSITIONS: Record<ExamStatus, ExamStatus[]> = {
  [ExamStatus.DRAFT]: [ExamStatus.SCHEDULED],
  [ExamStatus.SCHEDULED]: [ExamStatus.ACTIVE],
  [ExamStatus.ACTIVE]: [ExamStatus.CLOSED],
  [ExamStatus.CLOSED]: [],
};

export interface Exam {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  gradeUnsubmittedCode?: boolean;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  status: ExamStatus;
  /** Person A (publish): ISO 8601 once published to registered students, else null. */
  publishedAt: string | null;
  /** Person A (publish): pass mark as a percentage of the maximum score. */
  passPercentage: number;
  /** When false the exam has no pass mark: results show no pass/fail and no pass rate. */
  passMarkEnabled: boolean;
  /** The course that owns the exam: its instructors and TAs manage it. */
  courseId: string | null;
  /** The start time when the exam was published, kept so students can see it was moved. */
  originalStartTime: string | null;
  /** Optional note from the instructor about a reschedule, shown to students. */
  scheduleNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row in the exam_assignments join table — links a student to an exam.
 *  studentInfo is populated by the API when listing assignments. */
export interface ExamAssignment {
  id: string;
  examId: string;
  studentId: string;
  assignedAt: string;
  /** Populated by the backend join — always present on list responses */
  studentInfo?: {
    userId?: string;
    collegeId: string;
    fullName: string;
    email: string;
  };
}

// ---- Request/response shapes used by packages/api-client ----

export interface CreateExamRequest {
  /** The owning course; the caller must be allowed to edit exams on it. */
  courseId: string;
  title: string;
  description?: string;
  durationMinutes: number;
  gradeUnsubmittedCode?: boolean;
  startTime: string;
  endTime: string;
  passPercentage?: number;
  passMarkEnabled?: boolean;
}

export interface UpdateExamRequest {
  gradeUnsubmittedCode?: boolean;
  title?: string;
  description?: string;
  durationMinutes?: number;
  startTime?: string;
  endTime?: string;
  passPercentage?: number;
  passMarkEnabled?: boolean;
}

/**
 * POST /exams/:id/reschedule — move a published or scheduled exam.
 * Before anyone has started: any valid change. Once someone has started:
 * only a later endTime. A CLOSED exam can't be rescheduled.
 */
export interface RescheduleExamRequest {
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  /** Shown to students on their dashboard, e.g. "Delayed 30 min: lab network". */
  note?: string;
}

export interface AssignStudentRequest {
  studentId: string;
}

/** Used by the staff UI to resolve a college ID to a student before assigning */
export interface StudentLookupResponse {
  id: string;
  collegeId: string;
  fullName: string;
  email: string;
  isActive: boolean;
}
