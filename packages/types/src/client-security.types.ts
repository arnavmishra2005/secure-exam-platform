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

// ---- Electron preload bridge (window.desktop) ----
// Implemented by apps/exam-client/src/preload; mirrors apps/exam-client/src/shared/types.ts.

export type DesktopViolationType =
  | 'FOCUS_LOST'
  | 'FOCUS_REGAINED'
  | 'DISPLAY_CHANGED'
  | 'BLOCKED_SHORTCUT'
  | 'DEVTOOLS_ATTEMPT'
  | 'NAV_BLOCKED'
  | 'CLIPBOARD_BLOCKED'
  | 'KIOSK_CHECK_FAILED'
  | 'HEARTBEAT_LOST';

export interface DesktopSecurityEvent {
  type: DesktopViolationType;
  detail?: string;
  /** Epoch ms on the device. */
  ts: number;
}

export interface DesktopReadiness {
  ok: boolean;
  checks: {
    singleDisplay: boolean;
    backendReachable: boolean;
    noForbiddenProcesses: boolean;
    forbiddenList?: string[];
  };
}

export interface DesktopBridge {
  isDesktop: () => boolean;
  getReadiness?: () => Promise<DesktopReadiness>;
  exitKiosk?: (pin?: string) => Promise<{ ok: boolean; reason?: string }>;
  notifySubmitted?: () => void;
  setSecurityMode?: (active: boolean) => void;
  openExternal?: (url: string) => Promise<boolean>;
  logViolation?: (type: DesktopViolationType, detail?: string) => void;
  onSecurityEvent?: (cb: (event: DesktopSecurityEvent) => void) => () => void;
  /** Local Python runner (docs/local-code-runner.md). */
  runCode?: (job: import('./coding.types').LocalRunJob) => Promise<import('./coding.types').ExecutionOutcome[]>;
}
