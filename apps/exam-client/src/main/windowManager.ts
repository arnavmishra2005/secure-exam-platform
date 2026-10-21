import { BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import { APP_ORIGIN, IS_DEV, WEB_DEV_URL } from './config';

/**
 * The window starts as an ordinary maximised window, so the login screen and
 * the student dashboard behave like any app. Lockdown (kiosk, fullscreen,
 * always-on-top, shortcut blocking) is switched on only while an exam is
 * running: see SET_SECURITY_MODE in ipc/channels.ts.
 */
export function createKioskWindow(): BrowserWindow {
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

  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  void win.loadURL(IS_DEV ? WEB_DEV_URL : `${APP_ORIGIN}/index.html`);

  return win;
}
