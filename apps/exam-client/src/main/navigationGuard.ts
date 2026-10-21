import { BrowserWindow } from 'electron';
import { ALLOWED_ORIGINS } from './config';
import { isSecurityActive } from './ipc/channels';

export function installNavigationGuard(win: BrowserWindow): void {
  const wc = win.webContents;

  // The app is a single-page app: it never needs to leave its own origin.
  wc.on('will-navigate', (event, url) => {
    if (ALLOWED_ORIGINS.includes(new URL(url).origin)) return;
    event.preventDefault();
    wc.send('desktop:security-event', { type: 'NAV_BLOCKED', detail: url, ts: Date.now() });
  });

  // No popups or new windows, ever.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  // No context menu (copy/inspect) during an exam.
  wc.on('context-menu', (event) => {
    if (isSecurityActive()) event.preventDefault();
  });
}
