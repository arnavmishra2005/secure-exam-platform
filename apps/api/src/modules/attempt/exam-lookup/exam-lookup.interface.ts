/**
 * Owner: Person C.
 *
 * C's own abstraction over Person B's Exam domain. C never imports B's
 * ExamService/ExamEntity directly — the Attempt module depends on this
 * interface instead, so C's code compiles and runs standalone (against
 * MockExamLookupService) until B's real Exam module is wired in. See
 * mock-exam-lookup.service.ts for the swap-in instructions.
 */

export const EXAM_LOOKUP_SERVICE = Symbol('EXAM_LOOKUP_SERVICE');

/** Mirrors Person B's `ExamStatus` enum values (file-structure doc, section 2). */
export type ExamLookupStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'CLOSED';

export interface ExamLookupInfo {
  id: string;
  status: ExamLookupStatus;
  /** ISO 8601 */
  startTime: string;
  /** ISO 8601 */
  endTime: string;
  durationMinutes: number;
  /** ISO 8601 once published to registered students (Phase 4), else null. */
  publishedAt: string | null;
}

export interface IExamLookupService {
  /** Returns null if the exam does not exist. */
  getExamById(examId: string): Promise<ExamLookupInfo | null>;

  /**
   * Whether this student (users.id, the JWT sub) is registered to sit this
   * exam. Strict: an exam with no registrations admits nobody.
   */
  isStudentAssignedToExam(examId: string, studentId: string): Promise<boolean>;

  /** Exam titles by id, for display on the monitoring screen. Unknown ids are omitted. */
  getExamTitles(examIds: string[]): Promise<Map<string, string>>;
}
