// Owner: Person A (Identity/Auth/Security)
// Student management. Every new student is enrolled in one of the caller's
// courses, because staff only see students enrolled in their own courses.

import type { Student, StudentLookupResponse } from '@secure-exam/types';
import { apiClient } from './client';

export interface CreateStudentPayload {
  collegeId: string;
  fullName: string;
  email: string;
  password?: string;
}

export interface StudentWithUser extends Student {
  user: { id: string; email: string; fullName: string; isActive: boolean };
}

export interface BulkImportResponse {
  createdCount: number;
  /** Students enrolled in the course, new and already existing ones. */
  enrolledCount: number;
  skipped: Array<{ collegeId: string; reason: string }>;
}

export async function listStudents(): Promise<StudentWithUser[]> {
  const { data } = await apiClient.get<StudentWithUser[]>('/students');
  return data;
}

/** Creates the account and enrols it in the course. */
export async function createStudent(courseId: string, payload: CreateStudentPayload): Promise<StudentWithUser> {
  const { data } = await apiClient.post<StudentWithUser>(`/courses/${courseId}/students/create`, payload);
  return data;
}

/** Creates the new accounts and enrols every listed student (new or existing college ID) in the course. */
export async function bulkImportStudents(
  courseId: string,
  students: CreateStudentPayload[],
): Promise<BulkImportResponse> {
  const { data } = await apiClient.post<BulkImportResponse>(`/courses/${courseId}/students/import`, {
    students,
  });
  return data;
}

export async function updateStudent(
  id: string,
  payload: Partial<Pick<CreateStudentPayload, 'fullName' | 'email'>> & { isActive?: boolean },
): Promise<StudentWithUser> {
  const { data } = await apiClient.patch<StudentWithUser>(`/students/${id}`, payload);
  return data;
}

/** Resolve a college ID (e.g. "CS2021001") to the full student record.
 *  Returns null if no student found (404). Used before assigning to exam. */
export async function lookupStudentByCollegeId(
  collegeId: string,
): Promise<StudentLookupResponse | null> {
  try {
    const { data } = await apiClient.get<StudentLookupResponse>(
      `/students/lookup?collegeId=${encodeURIComponent(collegeId)}`,
    );
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

/** Fetch a single student by UUID */
export async function getStudentById(id: string): Promise<StudentLookupResponse | null> {
  try {
    const { data } = await apiClient.get<StudentLookupResponse>(`/students/${id}`);
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}
