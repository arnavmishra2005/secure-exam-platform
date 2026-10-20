/**
 * Owner: Person C (Time Extension)
 *
 * Heartbeats for a running attempt. Each response carries the server's clock
 * and the attempt's current expiry, so:
 *  - an admin's time extension reaches the timer within one heartbeat, and
 *  - the countdown runs on server time, not the (possibly wrong) device clock.
 * Also keeps the admin monitoring screen's "last seen" fresh.
 */

import { sendHeartbeat } from '@secure-exam/api-client';
import type { AttemptStatus } from '@secure-exam/types';
import { useEffect, useState } from 'react';

export const HEARTBEAT_INTERVAL_MS = Number(import.meta.env.VITE_HEARTBEAT_INTERVAL_MS) || 15_000;

export interface ServerClock {
  /** Latest server-authoritative expiry (ISO 8601). */
  expiresAt: string;
  /** Add to Date.now() to get server time. */
  offsetMs: number;
  status: AttemptStatus;
  /** Device time of the last successful heartbeat. */
  syncedAt: number;
}

/**
 * Server time minus device time, assuming the server stamped its time halfway
 * through the round trip (the NTP-style estimate).
 */
export function computeClockOffset(sentAt: number, receivedAt: number, serverTimeIso: string): number {
  const midpoint = sentAt + (receivedAt - sentAt) / 2;
  return new Date(serverTimeIso).getTime() - midpoint;
}

export function useServerClock(attemptId: string | null, intervalMs = HEARTBEAT_INTERVAL_MS): ServerClock | null {
  const [clock, setClock] = useState<ServerClock | null>(null);

  useEffect(() => {
    setClock(null);
    if (!attemptId) return;
    let cancelled = false;

    async function beat() {
      const sentAt = Date.now();
      try {
        const response = await sendHeartbeat(attemptId!);
        if (cancelled) return;
        const receivedAt = Date.now();
        setClock({
          expiresAt: response.expiresAt,
          offsetMs: computeClockOffset(sentAt, receivedAt, response.serverTime),
          status: response.status,
          syncedAt: receivedAt,
        });
      } catch {
        // Offline or briefly unreachable: keep the last known clock. The sync
        // engine's network monitor reports connectivity to the student.
      }
    }

    void beat();
    const timer = setInterval(() => void beat(), intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && void beat();
    const onOnline = () => void beat();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [attemptId, intervalMs]);

  return clock;
}
