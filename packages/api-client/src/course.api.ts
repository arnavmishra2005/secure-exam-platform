// Owner: Person A (Platform, Courses, Publish, Results)

import type {
  AssignExamToCourseResponse,
  Course,
  CourseEnrollmentWithStudent,
  CourseWithCounts,
  CreateCourseRequest,
  EnrollStudentsResponse,
  ExamCourse,
  ExamRegistrationWithStudent,
  UpdateCourseRequest,
} from '@secure-exam/types';
import { apiClient } from './client';

// ---- Courses ----

export async function listCourses(): Promise<CourseWithCounts[]> {
  const { data } = await apiClient.get<CourseWithCounts[]>('/courses');
  return data;
}

export async function getCourse(courseId: string): Promise<CourseWithCounts> {
  const { data } = await apiClient.get<CourseWithCounts>(`/courses/${courseId}`);
  return data;
}

export async function createCourse(payload: CreateCourseRequest): Promise<Course> {
  const { data } = await apiClient.post<Course>('/courses', payload);
  return data;
}

export async function updateCourse(courseId: string, payload: UpdateCourseRequest): Promise<Course> {
  const { data } = await apiClient.patch<Course>(`/courses/${courseId}`, payload);
  return data;
}

export async function deleteCourse(courseId: string): Promise<void> {
  await apiClient.delete(`/courses/${courseId}`);
}

export async function listCourseStudents(courseId: string): Promise<CourseEnrollmentWithStudent[]> {
  const { data } = await apiClient.get<CourseEnrollmentWithStudent[]>(`/courses/${courseId}/students`);
  return data;
}

/** `studentIds` may be students.id values or college IDs. */
export async function enrollStudents(courseId: string, studentIds: string[]): Promise<EnrollStudentsResponse> {
  const { data } = await apiClient.post<EnrollStudentsResponse>(`/courses/${courseId}/students`, { studentIds });
  return data;
}

export async function unenrollStudent(courseId: string, studentId: string): Promise<{ registrationsRemoved: number }> {
  const { data } = await apiClient.delete<{ registrationsRemoved: number }>(
    `/courses/${courseId}/students/${encodeURIComponent(studentId)}`,
  );
  return data;
}

// ---- Exam registrations ----

export interface RegisterStudentsResponse {
  registeredCount: number;
  alreadyRegistered: string[];
  notFound: string[];
}

export interface ExamCourseWithCourse extends ExamCourse {
  course: { id: string; code: string; name: string };
  enrolledCount: number;
}

export async function listExamRegistrations(examId: string): Promise<ExamRegistrationWithStudent[]> {
  const { data } = await apiClient.get<ExamRegistrationWithStudent[]>(`/exams/${examId}/registrations`);
  return data;
}

export async function registerStudentsForExam(examId: string, studentIds: string[]): Promise<RegisterStudentsResponse> {
  const { data } = await apiClient.post<RegisterStudentsResponse>(`/exams/${examId}/registrations`, { studentIds });
  return data;
}

export async function unregisterStudentFromExam(examId: string, studentId: string): Promise<void> {
  await apiClient.delete(`/exams/${examId}/registrations/${encodeURIComponent(studentId)}`);
}

export async function listExamCourses(examId: string): Promise<ExamCourseWithCourse[]> {
  const { data } = await apiClient.get<ExamCourseWithCourse[]>(`/exams/${examId}/courses`);
  return data;
}

export async function assignCourseToExam(examId: string, courseId: string): Promise<AssignExamToCourseResponse> {
  const { data } = await apiClient.post<AssignExamToCourseResponse>(`/exams/${examId}/courses`, { courseId });
  return data;
}

export async function unassignCourseFromExam(examId: string, courseId: string): Promise<{ registrationsRemoved: number }> {
  const { data } = await apiClient.delete<{ registrationsRemoved: number }>(`/exams/${examId}/courses/${courseId}`);
  return data;
}
