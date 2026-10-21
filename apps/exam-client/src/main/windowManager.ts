import { BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import { APP_ORIGIN, IS_DEV, WEB_DEV_URL } from './config';

/** Where the web app is served from. */
export function appBaseUrl(): string {
  return IS_DEV ? WEB_DEV_URL : APP_ORIGIN;
}

/**
 * The window starts as an ordinary maximised window, so the login screen and
 * the student dashboard behave like any app. Lockdown (kiosk, fullscreen,
 * always-on-top, shortcut blocking) is switched on only while an exam is
 * running: see SET_SECURITY_MODE in ipc/channels.ts.
 */
export function createKioskWindow(initialPath = '/'): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: IS_DEV,
    },
  });

  // No menu bar, so no menu accelerators (Reload, Quit, Close, Zoom...) exist to be triggered.
  // macOS text fields need an Edit menu for Cmd+C/V/X/A/Z to work at all, so that is the only one kept.
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([
          {
            label: 'Edit',
            submenu: [
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'selectAll' },
            ],
          },
        ])
      : null,
  );

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  void win.loadURL(IS_DEV ? `${WEB_DEV_URL}${initialPath}` : `${APP_ORIGIN}${initialPath === '/' ? '/index.html' : initialPath}`);

  return win;
}
