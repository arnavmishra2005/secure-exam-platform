// Owner: Person A (Identity/Auth/Security)
// Students are the college's accounts (seeded from the college's student list);
// staff can't create them. They find them in the directory and enrol them.

import type { Student, StudentDirectoryPage, StudentLookupResponse } from '@secure-exam/types';
import { apiClient } from './client';

export interface StudentWithUser extends Student {
  user: { id: string; email: string; fullName: string; isActive: boolean };
}

/** Students enrolled in the caller's courses. */
export async function listStudents(): Promise<StudentWithUser[]> {
  const { data } = await apiClient.get<StudentWithUser[]>('/students');
  return data;
}

/** The college's whole student list, searched by email, college ID or name, a page at a time. */
export async function searchStudentDirectory(params: { search?: string; limit?: number; offset?: number } = {}): Promise<StudentDirectoryPage> {
  const { data } = await apiClient.get<StudentDirectoryPage>('/students/directory', {
    params: { search: params.search?.trim() || undefined, limit: params.limit, offset: params.offset },
  });
  return data;
}

export async function updateStudent(
  id: string,
  payload: { fullName?: string; email?: string; isActive?: boolean },
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
