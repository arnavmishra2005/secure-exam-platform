/**
 * Owner: Person B
 * Thin wrapper functions only — no business logic. The admin portal
 * imports these instead of hand-writing fetch calls.
 */
import { apiClient } from './client';
import type {
  AssignStudentRequest,
  CreateExamRequest,
  Exam,
  ExamAssignment,
  UpdateExamRequest,
} from '@secure-exam/types';

export function getExams(): Promise<Exam[]> {
  return apiClient.get<Exam[]>('/exams').then((res) => res.data);
}

export function getExam(examId: string): Promise<Exam> {
  return apiClient.get<Exam>(`/exams/${examId}`).then((res) => res.data);
}

export function createExam(data: CreateExamRequest): Promise<Exam> {
  return apiClient.post<Exam>('/exams', data).then((res) => res.data);
}

export function updateExam(examId: string, data: UpdateExamRequest): Promise<Exam> {
  return apiClient.patch<Exam>(`/exams/${examId}`, data).then((res) => res.data);
}

export function deleteExam(examId: string): Promise<void> {
  return apiClient.delete<void>(`/exams/${examId}`).then(() => undefined);
}

export function scheduleExam(examId: string): Promise<Exam> {
  return apiClient.post<Exam>(`/exams/${examId}/schedule`).then((res) => res.data);
}

export function startExam(examId: string): Promise<Exam> {
  return apiClient.post<Exam>(`/exams/${examId}/start`).then((res) => res.data);
}

export function closeExam(examId: string): Promise<Exam> {
  return apiClient.post<Exam>(`/exams/${examId}/close`).then((res) => res.data);
}

export function getAssignedStudents(examId: string): Promise<ExamAssignment[]> {
  return apiClient.get<ExamAssignment[]>(`/exams/${examId}/students`).then((res) => res.data);
}

export function assignStudent(
  examId: string,
  data: AssignStudentRequest,
): Promise<ExamAssignment> {
  return apiClient.post<ExamAssignment>(`/exams/${examId}/students`, data).then((res) => res.data);
}

export function unassignStudent(examId: string, studentId: string): Promise<void> {
  return apiClient.delete<void>(`/exams/${examId}/students/${studentId}`).then(() => undefined);
}
