// Owner: Person A (Identity/Auth/Security)
// Fields only — no logic. Both apps/api and apps/admin-web import from here.

export enum Role {
  ADMIN = 'admin',
  STUDENT = 'student',
}

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
