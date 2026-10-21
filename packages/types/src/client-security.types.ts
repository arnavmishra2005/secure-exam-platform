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

/** What the exam app can report. The API accepts exactly these. */
export const DESKTOP_VIOLATION_TYPES = [
  'FOCUS_LOST',
  'FOCUS_REGAINED',
  'DISPLAY_CHANGED',
  'BLOCKED_SHORTCUT',
  'DEVTOOLS_ATTEMPT',
  'NAV_BLOCKED',
  'CLIPBOARD_BLOCKED',
  'KIOSK_CHECK_FAILED',
  'HEARTBEAT_LOST',
] as const;

export type DesktopViolationType = (typeof DESKTOP_VIOLATION_TYPES)[number];

/** Informational events that do not count towards an attempt's violation total. */
export const NON_VIOLATION_TYPES: readonly DesktopViolationType[] = ['FOCUS_REGAINED', 'HEARTBEAT_LOST'];

/** One event as the exam app sends it: POST /attempts/:attemptId/events. */
export interface SecurityEventInput {
  type: DesktopViolationType;
  /** For shortcuts, the combination pressed, e.g. "Cmd+R". */
  detail?: string;
  /** ISO time on the student's device (informational; the server records its own time too). */
  occurredAt: string;
}

/** One recorded event, as the admin sees it: GET /attempts/:attemptId/events. */
export interface SecurityEventView {
  id: string;
  attemptId: string;
  type: DesktopViolationType;
  detail: string | null;
  occurredAt: string;
  createdAt: string;
}

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
  /** Events recorded since the last call; kept in the main process so a reload loses none. */
  drainEvents?: () => Promise<DesktopSecurityEvent[]>;
  onSecurityEvent?: (cb: (event: DesktopSecurityEvent) => void) => () => void;
  /** Local Python runner (docs/local-code-runner.md). */
  runCode?: (job: import('./coding.types').LocalRunJob) => Promise<import('./coding.types').ExecutionOutcome[]>;
}
