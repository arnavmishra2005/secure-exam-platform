/**
 * Owner: Person C (Attempt / Answer / Submission / Monitoring)
 *
 * Thin wrapper functions typed against packages/types, used by
 * apps/admin-web so nobody hand-writes fetch calls.
 */

import { apiClient } from './client';
import type {
  Attempt,
  AttemptMonitorView,
  AttemptStatus,
  Answer,
  PublicQuestion,
  Submission,
  Result,
} from '@secure-exam/types';

// ---- Attempts ---------------------------------------------------------

export interface StartAttemptPayload {
  examId: string;
}

export function startAttempt(payload: StartAttemptPayload): Promise<Attempt> {
  return apiClient.post<Attempt>('/attempts', payload).then((res) => res.data);
}

/** Student-only: the caller's own attempt at an exam (404 if not started), for resuming it. */
export function getMyAttemptForExam(examId: string): Promise<Attempt> {
  return apiClient.get<Attempt>('/attempts/current', { params: { examId } }).then((res) => res.data);
}

export function getAttempt(attemptId: string): Promise<Attempt> {
  return apiClient.get<Attempt>(`/attempts/${attemptId}`).then((res) => res.data);
}

export interface ListAttemptsParams {
  examId?: string;
  status?: AttemptStatus;
  page?: number;
  limit?: number;
}

export interface PaginatedAttempts {
  items: AttemptMonitorView[];
  total: number;
  page: number;
  limit: number;
}

/** Admin-only: powers the /monitoring screen. */
export function listAttempts(params: ListAttemptsParams = {}): Promise<PaginatedAttempts> {
  return apiClient.get<PaginatedAttempts>('/attempts', { params }).then((res) => res.data);
}

/** Student-only: the attempt's exam questions, without the answer key. */
export function getAttemptQuestions(attemptId: string): Promise<PublicQuestion[]> {
  return apiClient.get<PublicQuestion[]>(`/attempts/${attemptId}/questions`).then((res) => res.data);
}

export function sendHeartbeat(attemptId: string): Promise<void> {
  return apiClient.post(`/attempts/${attemptId}/heartbeat`).then(() => undefined);
}

// ---- Answers ------------------------------------------------------------

export interface SaveAnswerPayload {
  selectedOptionIds?: string[];
  textResponse?: string;
  markedForReview?: boolean;
  clearResponse?: boolean;
}

export function saveAnswer(
  attemptId: string,
  questionId: string,
  payload: SaveAnswerPayload,
): Promise<Answer> {
  return apiClient
    .put<Answer>(`/attempts/${attemptId}/answers/${questionId}`, payload)
    .then((res) => res.data);
}

export function listAnswers(attemptId: string): Promise<Answer[]> {
  return apiClient.get<Answer[]>(`/attempts/${attemptId}/answers`).then((res) => res.data);
}

// ---- Submission -----------------------------------------------------

export function submitAttempt(attemptId: string): Promise<{ submission: Submission; result: Result }> {
  return apiClient
    .post<{ submission: Submission; result: Result }>(`/attempts/${attemptId}/submit`, {})
    .then((res) => res.data);
}

// ---- Admin: submissions list + result publishing (/results screen) ----

export interface ListSubmissionsParams {
  examId?: string;
  published?: boolean;
  page?: number;
  limit?: number;
}

export interface SubmissionWithResult {
  submission: Submission;
  result: Result | null;
}

export interface PaginatedSubmissions {
  items: SubmissionWithResult[];
  total: number;
  page: number;
  limit: number;
}

export function listSubmissions(params: ListSubmissionsParams = {}): Promise<PaginatedSubmissions> {
  return apiClient.get<PaginatedSubmissions>('/submissions', { params }).then((res) => res.data);
}

export function getResult(attemptId: string): Promise<Result> {
  return apiClient.get<Result>(`/submissions/${attemptId}/result`).then((res) => res.data);
}

export function overrideResultScore(attemptId: string, score: number, note?: string): Promise<Result> {
  return apiClient
    .patch<Result>(`/submissions/${attemptId}/result`, { score, note })
    .then((res) => res.data);
}

export function publishResult(attemptId: string): Promise<Result> {
  return apiClient
    .post<Result>(`/submissions/${attemptId}/result/publish`, {})
    .then((res) => res.data);
}

export function unpublishResult(attemptId: string): Promise<Result> {
  return apiClient
    .post<Result>(`/submissions/${attemptId}/result/unpublish`, {})
    .then((res) => res.data);
}
