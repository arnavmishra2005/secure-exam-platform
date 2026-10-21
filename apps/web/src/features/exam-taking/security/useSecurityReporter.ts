// Owner: Person C (Electron, Kiosk & Security)
//
// While an exam is on screen in the exam app, send every recorded violation to
// the API, so the admin sees it. A no-op in a browser.

import { reportSecurityEvents } from '@secure-exam/api-client';
import { useEffect } from 'react';
import { isDesktop } from '../desktop/desktop';
import { flushSecurityQueue } from './flushSecurityQueue';

const FLUSH_INTERVAL_MS = 3_000;

export function useSecurityReporter(attemptId: string | null): void {
  useEffect(() => {
    const drain = window.desktop?.drainEvents;
    if (!attemptId || !isDesktop() || !drain) return;

    let running = false;
    const flush = async () => {
      if (running) return; // one request at a time
      running = true;
      try {
        let storage: Storage | null = null;
        try {
          storage = window.localStorage;
        } catch {
          // blocked: keep events in memory only
        }
        await flushSecurityQueue({ attemptId, drain: () => drain(), send: reportSecurityEvents, storage });
      } finally {
        running = false;
      }
    };

    void flush(); // events recorded before this page (re)loaded
    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      void flush(); // last events before leaving the exam screen
    };
  }, [attemptId]);
}
