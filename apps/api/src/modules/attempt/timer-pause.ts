// Owner: Person C. Pausing the exam timer for an invigilator-approved device change.
//
// When a student's exam app stops (a crash, a dead or frozen PC, the invigilator's exit PIN)
// and they open the exam again, an invigilator must allow the device change. For those
// changes the timer stops at the moment the student left off, so they lose no time:
//
//   1. The new device asks to continue (exam launch redeem): `timerPausedAt` is set to the old
//      device's last heartbeat. From then on the attempt is not expiring.
//   2. While the old device is still sending heartbeats (it is in use), the pause start moves
//      along with them, so no time is gained while working on it.
//   3. The student continues on the new device (redeem after approval): `expiresAt` moves on by
//      the paused time and the timer runs again from where it stopped.
//   4. No approval and no continue within DEVICE_CHANGE_WINDOW_MS: the pause is dropped, as if
//      the timer never stopped (the expiry sweep then auto-submits an attempt that ran out).
//
// Leaving through a violation is different: after Ctrl+Alt+Delete the exam app records the
// interruption, and continuing still needs approval but the timer keeps running, as before.

import { EXAM_INTERRUPTED_DETAIL_PREFIX } from '@secure-exam/types';
import type { EntityManager } from 'typeorm';

/** How long a device change request waits for approval and the student's continue. */
export const DEVICE_CHANGE_WINDOW_MS = 10 * 60_000;

/** The attempt's expiry, counting a paused timer as stopped. */
export function effectiveExpiresAt(attempt: { expiresAt: Date; timerPausedAt?: Date | null }, now: Date = new Date()): Date {
  if (!attempt.timerPausedAt) return attempt.expiresAt;
  const paused = Math.max(0, now.getTime() - attempt.timerPausedAt.getTime());
  return new Date(attempt.expiresAt.getTime() + paused);
}

/**
 * Did the student leave through a violation (Ctrl+Alt+Delete) since they last (re)entered?
 * Then the timer must keep running. Uses the server's own receive times.
 */
export async function leftThroughViolation(manager: EntityManager, attemptId: string, enteredAt: Date): Promise<boolean> {
  const [row] = await manager.query(
    `SELECT EXISTS (
       SELECT 1 FROM security_events e
        WHERE e."attemptId" = $1 AND e."type" = 'BLOCKED_SHORTCUT' AND e."detail" LIKE $2
          AND e."createdAt" > COALESCE(
            (SELECT MAX(d."createdAt") FROM security_events d WHERE d."attemptId" = $1 AND d."type" = 'DEVICE_CHANGED'),
            $3)
     ) AS "interrupted"`,
    [attemptId, `${EXAM_INTERRUPTED_DETAIL_PREFIX}%`, enteredAt],
  );
  return row?.interrupted === true;
}

/** When the student was last active on the device they are leaving (its last heartbeat). */
export async function lastSeenOnOldDevice(manager: EntityManager, attemptId: string): Promise<Date | null> {
  const [row] = await manager.query(`SELECT MAX("lastSeenAt") AS "lastSeen" FROM exam_sessions WHERE "attemptId" = $1`, [attemptId]);
  return row?.lastSeen ? new Date(row.lastSeen) : null;
}
