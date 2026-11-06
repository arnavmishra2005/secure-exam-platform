/**
 * Owner: Person B. Question-wise results (staff).
 */
import { apiClient } from './client';
import type {
  AdjustQuestionScoreRequest,
  AdjustQuestionScoreResponse,
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

/** Manual mark adjustment for one question of a finished attempt (#13). */
export function adjustQuestionScore(
  examId: string,
  attemptId: string,
  questionId: string,
  data: AdjustQuestionScoreRequest,
): Promise<AdjustQuestionScoreResponse> {
  return apiClient
    .patch<AdjustQuestionScoreResponse>(`/exams/${examId}/question-analytics/attempts/${attemptId}/questions/${questionId}/score`, data)
    .then((res) => res.data);
}

/** Re-score finished attempts after questions were edited (whole exam, or one question). */
export function recalculateResults(examId: string, data: RecalculateRequest = {}): Promise<RecalculateResponse> {
  return apiClient
    .post<RecalculateResponse>(`/exams/${examId}/question-analytics/recalculate`, data)
    .then((res) => res.data);
}
