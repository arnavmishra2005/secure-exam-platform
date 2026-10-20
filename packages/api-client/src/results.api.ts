// Owner: Person A (Platform, Courses, Publish, Results)
// Person B adds getExamQuestionAnalytics() for the Questions tab.

import type {
  ExamResultsOverview,
  ExamResultsSummary,
  ExamStudentResults,
  PublishResultsResponse,
} from '@secure-exam/types';
import { apiClient } from './client';

export async function listResultExams(): Promise<ExamResultsSummary[]> {
  const { data } = await apiClient.get<ExamResultsSummary[]>('/results/exams');
  return data;
}

export async function getExamResultsOverview(examId: string): Promise<ExamResultsOverview> {
  const { data } = await apiClient.get<ExamResultsOverview>(`/results/exams/${examId}/overview`);
  return data;
}

export async function getExamStudentResults(examId: string): Promise<ExamStudentResults> {
  const { data } = await apiClient.get<ExamStudentResults>(`/results/exams/${examId}/students`);
  return data;
}

export async function publishExamResults(examId: string): Promise<PublishResultsResponse> {
  const { data } = await apiClient.post<PublishResultsResponse>(`/results/exams/${examId}/publish-results`);
  return data;
}

export async function recomputeExamResults(examId: string): Promise<{ attemptsGraded: number; failed: number }> {
  const { data } = await apiClient.post<{ attemptsGraded: number; failed: number }>(`/results/exams/${examId}/recompute`);
  return data;
}
