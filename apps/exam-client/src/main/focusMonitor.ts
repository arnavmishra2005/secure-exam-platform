import { BrowserWindow } from 'electron';
import { isSecurityActive } from './ipc/channels';

export function installFocusMonitor(win: BrowserWindow): void {
  // Window-level blur (student switched away via Alt+Tab or similar OS mechanism)
  win.on('blur', () => {
    if (win.isDestroyed() || !isSecurityActive()) return;
    win.webContents.send('desktop:security-event', {
      type: 'FOCUS_LOST',
      detail: 'window blurred',
      ts: Date.now(),
    });
    // Force focus back during active exam
    if (isSecurityActive()) {
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.focus();
        }
      }, 200);
    }
  });

  win.on('focus', () => {
    if (win.isDestroyed() || !isSecurityActive()) return;
    win.webContents.send('desktop:security-event', {
      type: 'FOCUS_REGAINED',
      detail: 'window focused',
      ts: Date.now(),
    });
  });
}

