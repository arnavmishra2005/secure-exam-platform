/**
 * Owner: Person B. Question-wise results (admin).
 */
import { apiClient } from './client';
import type {
  AttemptDrilldown,
  QuestionAnalyticsMatrix,
  RecalculateRequest,
  RecalculateResponse,
} from '@secure-exam/types';

export function getQuestionAnalytics(examId: string): Promise<QuestionAnalyticsMatrix> {
  return apiClient.get<QuestionAnalyticsMatrix>(`/exams/${examId}/question-analytics`).then((res) => res.data);
}

export function getAttemptDrilldown(examId: string, attemptId: string): Promise<AttemptDrilldown> {
  return apiClient
    .get<AttemptDrilldown>(`/exams/${examId}/question-analytics/attempts/${attemptId}`)
    .then((res) => res.data);
}

/** Re-score finished attempts after questions were edited (whole exam, or one question). */
export function recalculateResults(examId: string, data: RecalculateRequest = {}): Promise<RecalculateResponse> {
  return apiClient
    .post<RecalculateResponse>(`/exams/${examId}/question-analytics/recalculate`, data)
    .then((res) => res.data);
}
