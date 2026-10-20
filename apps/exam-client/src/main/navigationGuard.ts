import { BrowserWindow, shell } from 'electron';

const API_ORIGINS = [
  'http://localhost:3000',
  // ponytail: add production API origin here via env var when deploying
];

export function installNavigationGuard(win: BrowserWindow): void {
  const wc = win.webContents;

  // Block all external navigation
  wc.on('will-navigate', (event, url) => {
    const allowed = API_ORIGINS.some((o) => url.startsWith(o));
    const isSelf =
      url.startsWith('http://localhost:3002') || // dev
      url.startsWith('file://');                  // prod
    if (!allowed && !isSelf) {
      event.preventDefault();
      wc.send('desktop:security-event', {
        type: 'NAV_BLOCKED',
        detail: url,
        ts: Date.now(),
      });
    }
  });

  // Block all new windows / popups
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Open any external links in the system browser, not inside the kiosk
  wc.on('new-window' as Parameters<typeof wc.on>[0], (event) => {
    event.preventDefault();
  });

  // Block context menu (right-click) in production
  if (process.env.NODE_ENV === 'production') {
    wc.on('context-menu', (event) => event.preventDefault());
  }
}

