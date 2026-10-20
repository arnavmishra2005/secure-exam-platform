/**
 * Owner: Person C (Electron, Kiosk & Security)
 *
 * CONTRACT ONLY (Day 1 morning). Person C's client-security module and the
 * Electron app implement these. Events are queued on the device through
 * IOfflineStore v2 (queueEvent) and synced to POST /attempts/:id/events.
 */

export enum ClientType {
  WEB = 'WEB',
  DESKTOP = 'DESKTOP',
}

export interface DeviceSession {
  id: string;
  attemptId: string;
  clientType: ClientType;
  clientVersion: string | null;
  deviceFingerprint: string | null;
  startedAt: string;
  lastSeenAt: string;
}

export interface ExamSecurityPolicy {
  id: string;
  examId: string;
  /** When true, only the desktop client may start the exam. */
  requireDesktopClient: boolean;
  minClientVersion: string | null;
  /** Violations at which the attempt is flagged for review. */
  flagThreshold: number;
  /** Violations at which the attempt is auto-submitted (P1). */
  autoSubmitThreshold: number | null;
}

export enum SecurityEventType {
  FOCUS_LOST = 'FOCUS_LOST',
  FOCUS_REGAINED = 'FOCUS_REGAINED',
  DISPLAY_CHANGED = 'DISPLAY_CHANGED',
  BLOCKED_SHORTCUT = 'BLOCKED_SHORTCUT',
  BLOCKED_NAVIGATION = 'BLOCKED_NAVIGATION',
  HEARTBEAT_LOST = 'HEARTBEAT_LOST',
  READINESS_FAILED = 'READINESS_FAILED',
}

export interface SecurityEvent {
  id: string;
  attemptId: string;
  type: SecurityEventType;
  /** Client clock when the event happened (informational only). */
  occurredAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
