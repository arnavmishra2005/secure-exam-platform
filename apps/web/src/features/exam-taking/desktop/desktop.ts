// Owner: Person C (bridge) / ported to apps/web by integration.
// Typed access to the Electron preload bridge (window.desktop). Every helper
// is a no-op in a plain browser, so exam code can call them unconditionally.

import type { DesktopReadiness, DesktopSecurityEvent, DesktopViolationType } from '@secure-exam/types';
import { useEffect, useRef } from 'react';

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.desktop?.isDesktop() === true;
}

export const desktop = {
  getReadiness: (): Promise<DesktopReadiness> | null => window.desktop?.getReadiness?.() ?? null,
  exitKiosk: (pin?: string) =>
    window.desktop?.exitKiosk?.(pin) ?? Promise.resolve({ ok: false, reason: 'Not running in the exam app.' }),
  notifySubmitted: () => window.desktop?.notifySubmitted?.(),
  setSecurityMode: (active: boolean) => window.desktop?.setSecurityMode?.(active),
  logViolation: (type: DesktopViolationType, detail?: string) => window.desktop?.logViolation?.(type, detail),
};

/** Subscribe to security events pushed by the Electron main process. */
export function useDesktopSecurityEvents(onEvent: (event: DesktopSecurityEvent) => void): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    const subscribe = window.desktop?.onSecurityEvent;
    if (!subscribe) return;
    return subscribe((event) => handler.current(event));
  }, []);
}
