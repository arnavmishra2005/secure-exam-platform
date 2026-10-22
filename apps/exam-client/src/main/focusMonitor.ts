import type { BrowserWindow } from 'electron';
import { isSecurityActive } from './examState';
import { emitSecurityEvent } from './securityEvents';

function enforceWindowsExamWindow(win: BrowserWindow): void {
  if (win.isDestroyed() || !isSecurityActive()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isFullScreen()) win.setFullScreen(true);
  if (!win.isKiosk()) win.setKiosk(true);
  if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
  win.focus();
}

export function installFocusMonitor(win: BrowserWindow, platform: NodeJS.Platform = process.platform): void {
  // The student switched away (Alt+Tab, a notification, another window...).
  win.on('blur', () => {
    if (win.isDestroyed() || !isSecurityActive()) return;
    emitSecurityEvent(win, 'FOCUS_LOST', 'window blurred');
    // Take focus straight back.
    setTimeout(() => {
      if (platform === 'win32') {
        enforceWindowsExamWindow(win);
      } else if (!win.isDestroyed() && isSecurityActive()) {
        win.focus();
      }
    }, platform === 'win32' ? 0 : 200);
  });

  win.on('focus', () => {
    if (win.isDestroyed()) return;
    emitSecurityEvent(win, 'FOCUS_REGAINED', 'window focused');
  });

  if (platform !== 'win32') return;

  win.on('minimize', () => {
    if (win.isDestroyed() || !isSecurityActive()) return;
    emitSecurityEvent(win, 'FOCUS_LOST', 'Windows exam window minimized');
    setTimeout(() => enforceWindowsExamWindow(win), 0);
  });

  win.on('leave-full-screen', () => {
    if (!isSecurityActive()) return;
    setTimeout(() => enforceWindowsExamWindow(win), 0);
  });
}
