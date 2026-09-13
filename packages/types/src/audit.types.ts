// Owner: Person A (Identity/Auth/Security)
// Person B and Person C emit events of this shape via AuditService.logEvent().

export enum AuditEventType {
  // Auth events (Person A)
  LOGIN = 'LOGIN',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',

  // Student/User events (Person A)
  STUDENT_CREATED = 'STUDENT_CREATED',
  STUDENT_UPDATED = 'STUDENT_UPDATED',
  STUDENT_BULK_IMPORTED = 'STUDENT_BULK_IMPORTED',

  // Exam events (Person B)
  EXAM_CREATED = 'EXAM_CREATED',
  EXAM_UPDATED = 'EXAM_UPDATED',
  EXAM_SCHEDULED = 'EXAM_SCHEDULED',
  EXAM_STARTED = 'EXAM_STARTED',
  EXAM_CLOSED = 'EXAM_CLOSED',
  EXAM_DELETED = 'EXAM_DELETED',
  EXAM_STATUS_CHANGED = 'EXAM_STATUS_CHANGED',

  // Question events (Person B)
  QUESTION_CREATED = 'QUESTION_CREATED',
  QUESTION_UPDATED = 'QUESTION_UPDATED',
  QUESTION_DELETED = 'QUESTION_DELETED',
  QUESTIONS_BULK_IMPORTED = 'QUESTIONS_BULK_IMPORTED',

  // Student assignment events (Person B)
  STUDENT_ASSIGNED = 'STUDENT_ASSIGNED',
  STUDENT_UNASSIGNED = 'STUDENT_UNASSIGNED',

  // Attempt/Answer/Submission events (Person C)
  EXAM_ATTEMPT_STARTED = 'EXAM_ATTEMPT_STARTED',
  ANSWER_SAVED = 'ANSWER_SAVED',
  SUBMITTED = 'SUBMITTED',
  AUTO_SUBMITTED = 'AUTO_SUBMITTED',
  SECURITY_CHECK_FAILED = 'SECURITY_CHECK_FAILED',

  // Result events (Person C)
  RESULT_SCORE_OVERRIDDEN = 'RESULT_SCORE_OVERRIDDEN',
  RESULT_PUBLISHED = 'RESULT_PUBLISHED',
  RESULT_UNPUBLISHED = 'RESULT_UNPUBLISHED',
}

export interface AuditEvent {
  id: string;
  type: AuditEventType | string;
  actorId: string | null; // user id who performed the action, null for system
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  examId?: string;
  attemptId?: string;
  createdAt: string;
}
