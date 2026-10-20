import { BrowserWindow, Menu } from 'electron';
import * as path from 'path';

const IS_DEV = process.env.NODE_ENV !== 'production';
const DEV_URL = 'http://localhost:3002';

export function createKioskWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: !IS_DEV,
    kiosk: !IS_DEV,           // prevents resize, maximise, OS chrome in production
    alwaysOnTop: !IS_DEV,
    frame: true,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    show: false,
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

  // Start window maximized by default
  win.maximize();
  win.show();
  win.once('ready-to-show', () => {
    win.maximize();
  });

  if (IS_DEV) {
    win.loadURL(DEV_URL);
  } else {
    // Serve renderer/dist via file:// (app:// protocol requires additional setup)
    win.loadFile(path.join(__dirname, '../../renderer/dist/index.html'));
  }

  return win;
}

