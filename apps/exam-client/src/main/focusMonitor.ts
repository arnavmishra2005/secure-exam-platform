import type { BrowserWindow } from 'electron';
import { reportBackInWindow, reportLeftWindow } from './windowPresence';

export function installFocusMonitor(win: BrowserWindow): void {
  // The student switched away (Alt+Tab, a notification, another window...). Recorded once
  // per departure, and not while the lockdown itself is moving the window (windowPresence).
  win.on('blur', () => {
    if (win.isDestroyed()) return;
    reportLeftWindow(win, 'Switched away from the exam window');
    // windowLockdown restores visibility, fullscreen and focus together.
  });

  win.on('focus', () => {
    if (win.isDestroyed()) return;
    reportBackInWindow(win);
  });
}
