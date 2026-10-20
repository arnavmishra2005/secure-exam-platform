/**
 * Owner: Person C (Time Extension, Dashboard)
 */

import type { StudentDashboard, StudentExamView } from '@secure-exam/types';
import { apiClient } from './client';

export function getMyDashboard(): Promise<StudentDashboard> {
  return apiClient.get<StudentDashboard>('/me/dashboard').then((res) => res.data);
}

/** One published exam the caller is registered for (404 otherwise). */
export function getMyExam(examId: string): Promise<StudentExamView> {
  return apiClient.get<StudentExamView>(`/me/exams/${examId}`).then((res) => res.data);
}
