// Owner: Person A (Platform, Courses, Publish, Results)

import type { PublishExamRequest, PublishExamResponse, PublishReadiness } from '@secure-exam/types';
import { apiClient } from './client';

export async function getPublishReadiness(examId: string): Promise<PublishReadiness> {
  const { data } = await apiClient.get<PublishReadiness>(`/exams/${examId}/publish-readiness`);
  return data;
}

export async function publishExam(examId: string, payload: PublishExamRequest = {}): Promise<PublishExamResponse> {
  const { data } = await apiClient.post<PublishExamResponse>(`/exams/${examId}/publish`, payload);
  return data;
}
