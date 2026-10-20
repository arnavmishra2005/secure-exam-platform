import { BrowserWindow } from 'electron';

export function installFocusMonitor(win: BrowserWindow): void {
  // Window-level blur (student switched away via Alt+Tab or similar OS mechanism)
  win.on('blur', () => {
    win.webContents.send('desktop:security-event', {
      type: 'FOCUS_LOST',
      detail: 'window blurred',
      ts: Date.now(),
    });
    // Force focus back in production kiosk mode
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => win.focus(), 200);
    }
  });

  win.on('focus', () => {
    win.webContents.send('desktop:security-event', {
      type: 'FOCUS_REGAINED',
      detail: 'window focused',
      ts: Date.now(),
    });
  });
}

