/**
 * Owner: Person C
 * Wires the exam client's offline persistence to the app's session: a 401
 * the interceptor couldn't recover stops syncing (unsynced answers stay on
 * the device), a refreshed session retries what was interrupted.
 */

import { onSessionEvent, refreshSession } from '@/auth/session';
import { configurePersistence, retrySync, stopSync } from './persistence';

let configured = false;

export function setupExamTaking(): void {
  if (configured) return;
  configured = true;

  configurePersistence({
    onUnauthorized: () => {
      void refreshSession();
    },
  });

  onSessionEvent((event) => {
    if (event === 'ended') stopSync();
    if (event === 'refreshed') retrySync();
  });
}
