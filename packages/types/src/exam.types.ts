/**
 * Owner: Person B (Exam Content Domain)
 *
 * Plain type/interface declarations only — no logic lives here.
 * Both apps/api and apps/admin-web import from this file so the
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
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  status: ExamStatus;
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
    collegeId: string;
    fullName: string;
    email: string;
  };
}

// ---- Request/response shapes used by packages/api-client ----

export interface CreateExamRequest {
  title: string;
  description?: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
}

export interface UpdateExamRequest {
  title?: string;
  description?: string;
  durationMinutes?: number;
  startTime?: string;
  endTime?: string;
}

export interface AssignStudentRequest {
  studentId: string;
}

/** Used by the admin UI to resolve a college ID to a student before assigning */
export interface StudentLookupResponse {
  id: string;
  collegeId: string;
  fullName: string;
  email: string;
  isActive: boolean;
}
