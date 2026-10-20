import { BrowserWindow, Menu } from 'electron';
import * as path from 'path';

const IS_DEV = process.env.NODE_ENV !== 'production';
const DEV_URL = 'http://localhost:3002';

export function createKioskWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,           // prevents resize, maximise, OS chrome
    alwaysOnTop: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,       // prevent OS close button
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // ponytail: setContentProtection not available on Linux — rely on OS kiosk session instead
      devTools: IS_DEV,   // DevTools only in dev mode
    },
  });

  // Remove all application menus (File, Edit, View…)
  Menu.setApplicationMenu(null);

  if (IS_DEV) {
    win.loadURL(DEV_URL);
  } else {
    // Serve renderer/dist via file:// (app:// protocol requires additional setup)
    win.loadFile(path.join(__dirname, '../../renderer/dist/index.html'));
  }

  return win;
}

