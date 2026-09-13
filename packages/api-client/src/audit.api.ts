/**
 * Owner: Person C (Attempt / Answer / Submission / Monitoring)
 *
 * C owns this file because C's Audit Viewer screen (/audit) is the
 * consumer, but the endpoint itself (`GET /audit`) and the AuditEvent
 * shape belong to Person A's audit module.
 */

import { apiClient } from './client';
import type { AuditEvent, AuditEventType } from '@secure-exam/types';

export interface ListAuditEventsParams {
  examId?: string;
  attemptId?: string;
  eventType?: AuditEventType | string;
  type?: AuditEventType | string;
  actorId?: string;
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedAuditEvents {
  items: AuditEvent[];
  total: number;
  page: number;
  limit: number;
}

export function listAuditEvents(params: ListAuditEventsParams = {}): Promise<PaginatedAuditEvents> {
  return apiClient.get<PaginatedAuditEvents>('/audit', { params }).then((res) => res.data);
}
