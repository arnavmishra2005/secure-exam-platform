// Owner: Person A (Identity/Auth/Security)
// Not explicitly enumerated in the file-structure doc's api-client list, but
// added following the same one-file-per-domain pattern since Person A owns
// student management on both backend and admin portal.

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
  skipped: Array<{ collegeId: string; reason: string }>;
}

export async function listStudents(): Promise<StudentWithUser[]> {
  const { data } = await apiClient.get<StudentWithUser[]>('/students');
  return data;
}

export async function createStudent(payload: CreateStudentPayload): Promise<StudentWithUser> {
  const { data } = await apiClient.post<StudentWithUser>('/students', payload);
  return data;
}

export async function bulkImportStudents(
  students: CreateStudentPayload[],
): Promise<BulkImportResponse> {
  const { data } = await apiClient.post<BulkImportResponse>('/students/bulk-import', {
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
