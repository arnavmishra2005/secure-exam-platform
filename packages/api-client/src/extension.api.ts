/**
 * Owner: Person C (Time Extension, Dashboard)
 */

import type { ExamExtension, ExtendTimeRequest } from '@secure-exam/types';
import { apiClient } from './client';

export function listExamExtensions(examId: string): Promise<ExamExtension[]> {
  return apiClient.get<ExamExtension[]>(`/exams/${examId}/extensions`).then((res) => res.data);
}

/** Omit `studentId` to extend the whole exam. */
export function extendExamTime(examId: string, payload: ExtendTimeRequest): Promise<ExamExtension> {
  return apiClient.post<ExamExtension>(`/exams/${examId}/extensions`, payload).then((res) => res.data);
}
