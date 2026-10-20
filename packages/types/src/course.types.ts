/**
 * Owner: Person A (Platform, Courses, Publish, Results)
 *
 * Courses group students; assigning an exam to a course registers every
 * enrolled student for it. ExamRegistration is the single source of truth
 * for "who may sit this exam" (it replaces Phase 1's exam_assignments).
 *
 * ID convention: `studentId` on CourseEnrollment and ExamRegistration is a
 * students.id (the Student record), NOT a users.id. Attempts and Results
 * store the user id (JWT `sub`) instead; see docs/analytics-data-contract.md.
 */

export interface Course {
  id: string;
  /** Short unique code, e.g. "CS201". */
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseWithCounts extends Course {
  enrolledCount: number;
  examCount: number;
}

export interface CourseEnrollment {
  id: string;
  courseId: string;
  /** students.id */
  studentId: string;
  enrolledAt: string;
}

/** A student as listed under a course or an exam's registrations. */
export interface StudentSummary {
  /** students.id */
  id: string;
  /** users.id — what attempts/results reference. */
  userId: string;
  collegeId: string;
  fullName: string;
  email: string;
  isActive: boolean;
}

export interface CourseEnrollmentWithStudent extends CourseEnrollment {
  student: StudentSummary;
}

/** Links an exam to a course. Enrolled students get an ExamRegistration. */
export interface ExamCourse {
  id: string;
  examId: string;
  courseId: string;
  createdAt: string;
}

export enum RegistrationSource {
  /** Created because the student is enrolled in a course assigned to the exam. */
  COURSE = 'COURSE',
  /** Added to the exam individually by an admin. */
  MANUAL = 'MANUAL',
}

export interface ExamRegistration {
  id: string;
  examId: string;
  /** students.id */
  studentId: string;
  source: RegistrationSource;
  /** Set when source is COURSE: the course that caused the registration. */
  courseId: string | null;
  registeredAt: string;
}

export interface ExamRegistrationWithStudent extends ExamRegistration {
  student: StudentSummary;
}

// ---- Request/response shapes used by packages/api-client ----

export interface CreateCourseRequest {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateCourseRequest {
  code?: string;
  name?: string;
  description?: string;
}

export interface EnrollStudentsRequest {
  /** students.id values, or college IDs; the server accepts either. */
  studentIds: string[];
}

export interface EnrollStudentsResponse {
  enrolledCount: number;
  alreadyEnrolled: string[];
  notFound: string[];
  /** Registrations created for exams already assigned to this course. */
  registrationsCreated: number;
}

export interface AssignExamToCourseRequest {
  courseId: string;
}

export interface AssignExamToCourseResponse {
  examCourse: ExamCourse;
  /** New registrations created by expanding the course's enrollments. */
  registrationsCreated: number;
}
