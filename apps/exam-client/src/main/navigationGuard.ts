import type { BrowserWindow } from 'electron';
import { ALLOWED_ORIGINS } from './config';
import { isSecurityActive } from './examState';
import { emitSecurityEvent } from './securityEvents';

export function installNavigationGuard(win: BrowserWindow): void {
  const wc = win.webContents;

  // The app is a single-page app: it never needs to leave its own origin.
  wc.on('will-navigate', (event, url) => {
    if (ALLOWED_ORIGINS.includes(new URL(url).origin)) return;
    event.preventDefault();
    emitSecurityEvent(win, 'NAV_BLOCKED', url);
  });

  // No popups or new windows, ever.
  wc.setWindowOpenHandler((details) => {
    emitSecurityEvent(win, 'NAV_BLOCKED', details.url);
    return { action: 'deny' };
  });

  // No context menu (copy/inspect/reload) during an exam.
  wc.on('context-menu', (event) => {
    if (isSecurityActive()) event.preventDefault();
  });

  // No pinch or keyboard zoom: it would change the layout of the exam.
  wc.setZoomFactor(1);
  void wc.setVisualZoomLevelLimits(1, 1);
}
