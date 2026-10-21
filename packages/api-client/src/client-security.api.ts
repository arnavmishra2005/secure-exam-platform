/**
 * Owner: Person C (Electron, Kiosk & Security)
 * Violations reported by the exam app, and the admin's view of them.
 */

import type {
  ExamLaunchCreated,
  ExamLaunchPreview,
  LoginResponse,
  SecurityEventInput,
  SecurityEventView,
} from '@secure-exam/types';
import { apiClient } from './client';

/** Exam app only (student): report violations for the caller's own attempt. */
export function reportSecurityEvents(attemptId: string, events: SecurityEventInput[]): Promise<{ recorded: number }> {
  return apiClient.post<{ recorded: number }>(`/attempts/${attemptId}/events`, { events }).then((res) => res.data);
}

/** Admin: every violation recorded for an attempt, oldest first. */
export function getAttemptSecurityEvents(attemptId: string): Promise<SecurityEventView[]> {
  return apiClient.get<SecurityEventView[]>(`/attempts/${attemptId}/events`).then((res) => res.data);
}

// ---- Opening an exam in the exam app ----

/** Browser (signed-in student): a one-time token for opening this exam in the exam app. */
export function createExamLaunch(examId: string): Promise<ExamLaunchCreated> {
  return apiClient.post<ExamLaunchCreated>('/auth/exam-launch', { examId }).then((res) => res.data);
}

/** Exam app: whose launch token is this? Does not use it up. */
export function previewExamLaunch(token: string): Promise<ExamLaunchPreview> {
  return apiClient.post<ExamLaunchPreview>('/auth/exam-launch/preview', { token }).then((res) => res.data);
}

/** Exam app: the student clicked Login. Uses the token up and returns a normal session. */
export function redeemExamLaunch(token: string): Promise<LoginResponse & { examId: string }> {
  return apiClient.post<LoginResponse & { examId: string }>('/auth/exam-launch/redeem', { token }).then((res) => res.data);
}
