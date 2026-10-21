// Owner: Person C (Electron, Kiosk & Security)
//
// Moves security events from the exam app's main process to the API, and keeps
// them on the device when the API cannot be reached (offline, 401...) so they
// are sent later. Pure of React, so it can be tested without a component.

import type { DesktopSecurityEvent, SecurityEventInput } from '@secure-exam/types';

const BATCH = 50;
const MAX_QUEUED = 500;

export interface FlushDeps {
  attemptId: string;
  /** window.desktop.drainEvents */
  drain: () => Promise<DesktopSecurityEvent[]>;
  /** reportSecurityEvents */
  send: (attemptId: string, events: SecurityEventInput[]) => Promise<unknown>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

const keyFor = (attemptId: string) => `exam:securityQueue:${attemptId}`;

function read(deps: FlushDeps): SecurityEventInput[] {
  try {
    const raw = deps.storage?.getItem(keyFor(deps.attemptId));
    return raw ? (JSON.parse(raw) as SecurityEventInput[]) : [];
  } catch {
    return [];
  }
}

function write(deps: FlushDeps, queue: SecurityEventInput[]): void {
  try {
    if (queue.length === 0) deps.storage?.removeItem(keyFor(deps.attemptId));
    else deps.storage?.setItem(keyFor(deps.attemptId), JSON.stringify(queue.slice(-MAX_QUEUED)));
  } catch {
    // Storage full or unavailable: the events stay in memory for this run only.
  }
}

/** Returns how many events are still waiting after this attempt. */
export async function flushSecurityQueue(deps: FlushDeps): Promise<number> {
  let fresh: DesktopSecurityEvent[] = [];
  try {
    fresh = await deps.drain();
  } catch {
    // The bridge is unavailable: nothing new to collect.
  }

  // Persist before sending: if the page reloads mid-request, the events are not lost.
  let queue = [
    ...read(deps),
    ...fresh.map((e) => ({ type: e.type, detail: e.detail, occurredAt: new Date(e.ts).toISOString() })),
  ];
  write(deps, queue);

  while (queue.length > 0) {
    const batch = queue.slice(0, BATCH);
    try {
      await deps.send(deps.attemptId, batch);
    } catch {
      return queue.length; // keep them; the next tick retries
    }
    queue = queue.slice(batch.length);
    write(deps, queue);
  }
  return 0;
}
