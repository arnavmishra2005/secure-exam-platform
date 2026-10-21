import type { BrowserWindow } from 'electron';
import { ALLOWED_ORIGINS, WEB_ORIGIN } from './config';
import { EXAM_PATH, isAllowedAppPath, LAUNCH_PATH } from './allowedPaths';
import { isSecurityActive } from './examState';
import { emitSecurityEvent } from './securityEvents';

export function installNavigationGuard(win: BrowserWindow): void {
  const wc = win.webContents;

  // The app is a single-page app: it never needs to leave its own origin.
  wc.on('will-navigate', (event, url) => {
    const target = new URL(url);
    if (ALLOWED_ORIGINS.includes(target.origin) && isAllowedAppPath(target.pathname)) return;
    event.preventDefault();
    emitSecurityEvent(win, 'NAV_BLOCKED', url);
  });

  // The app's own screen changes (the web app's router) never go through will-navigate.
  // If it ever ends up anywhere but the three exam screens, put it back: on the exam if one is
  // running (the student must not lose their place), otherwise on the launch screen.
  wc.on('did-navigate-in-page', (_event, url) => {
    const target = new URL(url);
    if (isAllowedAppPath(target.pathname)) return;
    emitSecurityEvent(win, 'NAV_BLOCKED', url);
    void wc.loadURL(`${WEB_ORIGIN}${isSecurityActive() ? EXAM_PATH : LAUNCH_PATH}`);
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
