/**
 * Owner: Person C (Electron, Kiosk & Security)
 * Violations reported by the exam app, and the admin's view of them.
 */

import type { SecurityEventInput, SecurityEventView } from '@secure-exam/types';
import { apiClient } from './client';

/** Exam app only (student): report violations for the caller's own attempt. */
export function reportSecurityEvents(attemptId: string, events: SecurityEventInput[]): Promise<{ recorded: number }> {
  return apiClient.post<{ recorded: number }>(`/attempts/${attemptId}/events`, { events }).then((res) => res.data);
}

/** Admin: every violation recorded for an attempt, oldest first. */
export function getAttemptSecurityEvents(attemptId: string): Promise<SecurityEventView[]> {
  return apiClient.get<SecurityEventView[]>(`/attempts/${attemptId}/events`).then((res) => res.data);
}
