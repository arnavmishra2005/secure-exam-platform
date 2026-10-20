/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Server-seeded countdown timer.
 *
 * Key design rules (per Phase 2+3 plan):
 *   - The countdown is seeded from `expiresAt` delivered by the SERVER
 *     via AttemptContext — never from a client-computed start time.
 *   - On every AttemptContext re-fetch (60 s interval + window focus),
 *     the remaining time is recomputed from the fresh `expiresAt`,
 *     correcting any drift that accumulated since last seed.
 *   - When time reaches 0 the `onExpired` callback is called so the
 *     parent (ExamPage / Header) can trigger auto-submit UI.
 *   - This component is purely cosmetic: actual enforcement of expiry
 *     lives in Phase 1's server-side isAttemptValid() (timer.service.ts).
 */

import { useEffect, useRef, useState } from 'react';

interface TimerDisplayProps {
  /** ISO 8601 expiry timestamp from the server — null while loading. */
  expiresAt: string | null;
  /** Called once when the countdown reaches 0. */
  onExpired?: () => void;
  /** Server time minus device time (from heartbeats), so a wrong device clock doesn't skew the countdown. */
  serverOffsetMs?: number;
  className?: string;
}

export function computeRemaining(expiresAt: string, serverOffsetMs = 0): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - (Date.now() + serverOffsetMs)) / 1000));
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function TimerDisplay({ expiresAt, onExpired, serverOffsetMs = 0, className }: TimerDisplayProps) {
  const [remaining, setRemaining] = useState<number>(() =>
    expiresAt ? computeRemaining(expiresAt, serverOffsetMs) : 0,
  );
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  // Re-seed whenever the server provides a new expiresAt (drift correction).
  useEffect(() => {
    if (!expiresAt) return;
    setRemaining(computeRemaining(expiresAt, serverOffsetMs));
  }, [expiresAt, serverOffsetMs]);

  // Tick every second.
  useEffect(() => {
    if (!expiresAt) return;

    const id = setInterval(() => {
      // Re-compute from source to avoid accumulated integer drift.
      const fresh = computeRemaining(expiresAt, serverOffsetMs);
      setRemaining(fresh);
      // Outside the state updater: React may call an updater twice (StrictMode),
      // which would fire the auto-submit twice.
      if (fresh <= 0) {
        clearInterval(id);
        onExpiredRef.current?.();
      }
    }, 1_000);

    return () => clearInterval(id);
  }, [expiresAt, serverOffsetMs]);

  if (!expiresAt) {
    return (
      <span className={`font-mono text-muted-foreground ${className ?? ''}`}>--:--</span>
    );
  }

  const isUrgent = remaining <= 300; // last 5 minutes
  const isCritical = remaining <= 60; // last 1 minute

  return (
    <span
      className={[
        'font-mono font-semibold tabular-nums',
        isCritical ? 'text-destructive animate-pulse' : isUrgent ? 'text-warning' : 'text-foreground',
        className ?? '',
      ].join(' ')}
      aria-label={`Time remaining: ${formatTime(remaining)}`}
      aria-live="off"
    >
      {formatTime(remaining)}
    </span>
  );
}

