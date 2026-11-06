// Owner: Person C (Electron, Kiosk & Security)
//
// While an exam is on screen in the exam app, send every recorded violation to
// the API, so staff see it. A no-op in a browser.

import { reportSecurityEvents } from '@secure-exam/api-client';
import { useEffect } from 'react';
import { desktop, isDesktop } from '../desktop/desktop';
import { flushSecurityQueue } from './flushSecurityQueue';

const FLUSH_INTERVAL_MS = 3_000;

export function useSecurityReporter(attemptId: string | null): void {
  useEffect(() => {
    const drain = window.desktop?.drainEvents;
    if (!attemptId || !isDesktop() || !drain) return;

    let running: Promise<unknown> | null = null;
    const flush = (): Promise<unknown> => {
      if (running) return running;
      running = (async () => {
        let storage: Storage | null = null;
        try {
          storage = window.localStorage;
        } catch {
          // blocked: keep events in memory only
        }
        await flushSecurityQueue({ attemptId, drain: () => drain(), send: reportSecurityEvents, storage });
      })().finally(() => { running = null; });
      return running;
    };

    // Only the native Ctrl+Alt+Delete path authorises a PIN-free interruption.
    // Ordinary violations keep the exam open and use ViolationBanner.
    const unsubscribe = window.desktop?.onSecurityEvent?.(event => {
      if (event.type !== 'BLOCKED_SHORTCUT' || !event.detail?.startsWith('Ctrl+Alt+Delete: exam interrupted;')) return;
      void (async () => {
        // Let the editor's debounced draft reach the durable answer queue.
        await new Promise(resolve => setTimeout(resolve, 2_000));
        await flush();
        await flush(); // include events that arrived while an earlier drain was sending
        await desktop.exitKiosk();
      })();
    });

    void flush(); // events recorded before this page (re)loaded
    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      unsubscribe?.();
      void flush(); // last events before leaving the exam screen
    };
  }, [attemptId]);
}
