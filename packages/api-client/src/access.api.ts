// Owner: Person A (Identity/Auth/Security)
// Instructors, TAs and what each may do on a course.

import type {
  AddCourseStaffRequest,
  CourseStaffMember,
  MyAccess,
  UpdateCourseStaffRequest,
} from '@secure-exam/types';
import { apiClient } from './client';

/** The signed-in staff member's courses and permissions. */
export async function getMyAccess(): Promise<MyAccess> {
  const { data } = await apiClient.get<MyAccess>('/me/access');
  return data;
}

export async function listCourseStaff(courseId: string): Promise<CourseStaffMember[]> {
  const { data } = await apiClient.get<CourseStaffMember[]>(`/courses/${courseId}/staff`);
  return data;
}

/** Instructors only. Creates the TA's account when the email is new. */
export async function addCourseStaff(courseId: string, payload: AddCourseStaffRequest): Promise<CourseStaffMember> {
  const { data } = await apiClient.post<CourseStaffMember>(`/courses/${courseId}/staff`, payload);
  return data;
}

export async function updateCourseStaff(
  courseId: string,
  userId: string,
  payload: UpdateCourseStaffRequest,
): Promise<CourseStaffMember> {
  const { data } = await apiClient.patch<CourseStaffMember>(`/courses/${courseId}/staff/${userId}`, payload);
  return data;
}

export async function removeCourseStaff(courseId: string, userId: string): Promise<void> {
  await apiClient.delete(`/courses/${courseId}/staff/${userId}`);
}
