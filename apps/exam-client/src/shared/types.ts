// Shared IPC channel names and types between main, preload, and renderer.

export const IPC = {
  // Renderer → Main
  GET_READINESS: 'desktop:get-readiness',
  EXIT_KIOSK: 'desktop:exit-kiosk',
  LOG_VIOLATION: 'desktop:log-violation',
  // Main → Renderer
  SECURITY_EVENT: 'desktop:security-event',
} as const;

export type ViolationType =
  | 'FOCUS_LOST'
  | 'FOCUS_REGAINED'
  | 'DISPLAY_CHANGED'
  | 'BLOCKED_SHORTCUT'
  | 'DEVTOOLS_ATTEMPT'
  | 'NAV_BLOCKED'
  | 'KIOSK_CHECK_FAILED'
  | 'HEARTBEAT_LOST';

export interface SecurityEvent {
  type: ViolationType;
  detail?: string;
  ts: number; // epoch ms
}

export interface ReadinessResult {
  ok: boolean;
  checks: {
    singleDisplay: boolean;
    backendReachable: boolean;
    noForbiddenProcesses: boolean;
    // ponytail: clientVersion check deferred — needs backend ClientRelease endpoint (C backend, not yet built)
  };
}

