import type { BrowserWindow } from 'electron';
import { isSecurityActive } from './examState';
import { emitSecurityEvent } from './securityEvents';

export function installFocusMonitor(win: BrowserWindow): void {
  // The student switched away (Alt+Tab, a notification, another window...).
  win.on('blur', () => {
    if (win.isDestroyed() || !isSecurityActive()) return;
    emitSecurityEvent(win, 'FOCUS_LOST', 'window blurred');
    // Take focus straight back.
    setTimeout(() => {
      if (!win.isDestroyed() && isSecurityActive()) win.focus();
    }, 200);
  });

  win.on('focus', () => {
    if (win.isDestroyed()) return;
    emitSecurityEvent(win, 'FOCUS_REGAINED', 'window focused');
  });
}
