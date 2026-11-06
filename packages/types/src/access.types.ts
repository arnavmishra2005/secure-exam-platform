/**
 * Owner: Person A (Identity/Auth/Security)
 *
 * Who may do what, per course. Each course has staff (`course_staff`): its
 * instructors, who may do everything on it, and TAs, who may do only what an
 * instructor ticked for them on that course.
 */

/** Something a TA may be allowed to do on one course. Instructors implicitly have all of them. */
export enum Permission {
  QUESTION_BANK_VIEW = 'QUESTION_BANK_VIEW',
  QUESTION_BANK_EDIT = 'QUESTION_BANK_EDIT',
  EXAM_VIEW = 'EXAM_VIEW',
  EXAM_EDIT = 'EXAM_EDIT',
  STUDENTS_MANAGE = 'STUDENTS_MANAGE',
  MONITOR = 'MONITOR',
  EXTEND_TIME = 'EXTEND_TIME',
  RESULTS_VIEW = 'RESULTS_VIEW',
  MARKS_ADJUST = 'MARKS_ADJUST',
  RESULTS_PUBLISH = 'RESULTS_PUBLISH',
}

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/** What a newly added TA may do until an instructor changes it. */
export const DEFAULT_TA_PERMISSIONS: readonly Permission[] = [
  Permission.EXAM_VIEW,
  Permission.MONITOR,
  Permission.RESULTS_VIEW,
];

/** Human-readable labels, for the staff screen. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.QUESTION_BANK_VIEW]: 'View the question bank',
  [Permission.QUESTION_BANK_EDIT]: 'Edit the question bank',
  [Permission.EXAM_VIEW]: 'View exams',
  [Permission.EXAM_EDIT]: 'Create and edit exams',
  [Permission.STUDENTS_MANAGE]: 'Manage students',
  [Permission.MONITOR]: 'Monitor live exams',
  [Permission.EXTEND_TIME]: 'Extend exam time',
  [Permission.RESULTS_VIEW]: 'View results',
  [Permission.MARKS_ADJUST]: 'Adjust marks',
  [Permission.RESULTS_PUBLISH]: 'Publish results',
};

/** A person's role on one course. */
export enum CourseStaffRole {
  INSTRUCTOR = 'INSTRUCTOR',
  TA = 'TA',
}

/** One row of a course's Staff list. */
export interface CourseStaffMember {
  id: string;
  courseId: string;
  userId: string;
  fullName: string;
  email: string;
  role: CourseStaffRole;
  /** Empty for instructors: they may do everything on the course. */
  permissions: Permission[];
  addedAt: string;
}

/** The caller's access on one course. */
export interface MyCourseAccess {
  courseId: string;
  code: string;
  name: string;
  role: CourseStaffRole;
  /** Every permission for an instructor; what was granted for a TA. */
  permissions: Permission[];
}

/** GET /me/access: what the signed-in staff member may do, per course. */
export interface MyAccess {
  userId: string;
  role: string;
  courses: MyCourseAccess[];
}

// ---- Request shapes used by packages/api-client ----

export interface AddCourseStaffRequest {
  email: string;
  /** Required when the email has no account yet (a new TA is created). */
  fullName?: string;
  /** Required when the email has no account yet; at least 8 characters. */
  password?: string;
  role: CourseStaffRole;
  /** TAs only; defaults to DEFAULT_TA_PERMISSIONS. */
  permissions?: Permission[];
}

export interface UpdateCourseStaffRequest {
  permissions: Permission[];
}
