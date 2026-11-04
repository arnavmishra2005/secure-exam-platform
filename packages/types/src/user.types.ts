// Owner: Person A (Identity/Auth/Security)
// Fields only — no logic. Both apps/api and apps/web import from here.

/**
 * The kind of account. There is no all-seeing admin: an instructor sees only
 * the courses they teach, and a TA only what an instructor granted them on a
 * course (see access.types.ts).
 */
export enum Role {
  INSTRUCTOR = 'instructor',
  TA = 'ta',
  STUDENT = 'student',
}

/** Roles that work in the staff portal (never in the exam app). */
export const STAFF_ROLES: readonly Role[] = [Role.INSTRUCTOR, Role.TA];

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  userId: string;
  collegeId: string; // college/roll number used to map external identity
  fullName: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
