/**
 * Owner: Person B. Question-wise results (admin).
 */
import { apiClient } from './client';
import type { AttemptDrilldown, QuestionAnalyticsMatrix } from '@secure-exam/types';

export function getQuestionAnalytics(examId: string): Promise<QuestionAnalyticsMatrix> {
  return apiClient.get<QuestionAnalyticsMatrix>(`/exams/${examId}/question-analytics`).then((res) => res.data);
}

export function getAttemptDrilldown(examId: string, attemptId: string): Promise<AttemptDrilldown> {
  return apiClient
    .get<AttemptDrilldown>(`/exams/${examId}/question-analytics/attempts/${attemptId}`)
    .then((res) => res.data);
}
