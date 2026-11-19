// Whether the student is in the exam window, recorded as one incident per departure.
//
// Leaving the window shows up as several native events at once (blur, then minimize or
// hide, sometimes leave-full-screen). They are one departure: only the first is recorded
// (FOCUS_LOST), and FOCUS_REGAINED closes it when the window has focus again.
//
// While the lockdown itself moves the window (entering kiosk and full screen when the exam
// starts, or putting it back after an escape) the OS reports focus and visibility changes
// the student did not cause. On macOS, for example, the full-screen Space transition
// reports the window as hidden. Those are ignored for a moment ("settling"); if the window
// is still not focused when the moment is over, that is recorded then.

import type { BrowserWindow } from 'electron';
import { isSecurityActive } from './examState';
import { emitSecurityEvent } from './securityEvents';

let away = false;
let settleUntil = 0;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

type Win = BrowserWindow;

export function isWindowSettling(now = Date.now()): boolean {
  return now < settleUntil;
}

/** The lockdown is about to move the window: ignore focus/visibility changes for `ms`. */
export function settleWindow(win: Win, ms: number): void {
  const until = Date.now() + ms;
  if (until <= settleUntil) return;
  settleUntil = until;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = undefined;
    if (win.isDestroyed() || !isSecurityActive()) return;
    if (!win.isFocused()) reportLeftWindow(win, 'Not in the exam window');
  }, ms + 50);
  settleTimer.unref?.();
}

/** The student left the exam window (blur, minimize, hide, left full screen). */
export function reportLeftWindow(win: Win, detail: string): void {
  if (!isSecurityActive() || isWindowSettling() || away) return;
  away = true;
  emitSecurityEvent(win, 'FOCUS_LOST', detail);
}

/** The exam window has focus again. Recorded only after a recorded departure. */
export function reportBackInWindow(win: Win): void {
  if (!away) return;
  away = false;
  if (isSecurityActive()) emitSecurityEvent(win, 'FOCUS_REGAINED', 'Back in the exam window');
}

/** A new lock (or the end of the exam) starts from a clean state. */
export function resetWindowPresence(): void {
  away = false;
  settleUntil = 0;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = undefined;
}
