import { useEffect, useCallback } from 'react';

// Inlined from apps/exam-client/src/shared/types.ts — kept here so renderer bundle has no Node/Electron import
export type ViolationType =
  | 'FOCUS_LOST' | 'FOCUS_REGAINED' | 'DISPLAY_CHANGED'
  | 'BLOCKED_SHORTCUT' | 'DEVTOOLS_ATTEMPT' | 'NAV_BLOCKED'
  | 'KIOSK_CHECK_FAILED' | 'HEARTBEAT_LOST';

export interface SecurityEvent { type: ViolationType; detail?: string; ts: number; }

export interface ReadinessResult {
  ok: boolean;
  checks: { singleDisplay: boolean; backendReachable: boolean; noForbiddenProcesses: boolean; };
}

// Augment Window so TypeScript knows about window.desktop
declare global {
  interface Window {
    desktop?: {
      isDesktop: () => boolean;
      getReadiness: () => Promise<ReadinessResult>;
      exitKiosk: (pin: string) => Promise<{ ok: boolean; reason?: string }>;
      logViolation: (type: string, detail?: string) => void;
      onSecurityEvent: (cb: (event: SecurityEvent) => void) => () => void;
    };
  }
}

export function isDesktop(): boolean {
  return typeof window.desktop !== 'undefined' && window.desktop.isDesktop();
}

/**
 * Subscribe to security events from the Electron main process.
 * No-op when running in a regular browser.
 */
export function useDesktopSecurityEvents(
  onEvent: (event: SecurityEvent) => void,
): void {
  const stable = useCallback(onEvent, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!window.desktop) return;
    return window.desktop.onSecurityEvent(stable);
  }, [stable]);
}

export const desktop = {
  getReadiness: (): Promise<ReadinessResult> | null =>
    window.desktop?.getReadiness() ?? null,
  exitKiosk: (pin: string) =>
    window.desktop?.exitKiosk(pin) ?? Promise.resolve({ ok: false, reason: 'Not in kiosk' }),
  logViolation: (type: string, detail?: string) =>
    window.desktop?.logViolation(type, detail),
};
