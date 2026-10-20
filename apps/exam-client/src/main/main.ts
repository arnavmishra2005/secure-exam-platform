import { app } from 'electron';
import { createKioskWindow } from './windowManager';
import { installNavigationGuard } from './navigationGuard';
import { installInputGuard } from './inputGuard';
import { installFocusMonitor } from './focusMonitor';
import { installDisplayMonitor } from './displayMonitor';
import { registerIpcHandlers, isSecurityActive, setQuitting } from './ipc/channels';

// Single-instance lock: if a second copy is launched, focus the existing window and quit.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('before-quit', () => {
  setQuitting(true);
});

app.whenReady().then(() => {
  const win = createKioskWindow();

  // Intercept window close (Alt+F4 / window close button) during active exam
  win.on('close', (event) => {
    // If exam is active and not submitted, prevent closing without invigilator PIN
    if (isSecurityActive()) {
      event.preventDefault();
      win.webContents.send('desktop:security-event', {
        type: 'BLOCKED_SHORTCUT',
        detail: 'Alt+F4 / Close blocked during active exam',
        ts: Date.now(),
      });
    }
  });

  installNavigationGuard(win);
  installInputGuard(win);
  installFocusMonitor(win);
  installDisplayMonitor(win);
  registerIpcHandlers(win);

  // On Linux, 'activate' is not fired — only on macOS. No-op here.
});

// Prevent accidental quit if all windows closed (shouldn't happen in kiosk, but safety net)
app.on('window-all-closed', () => {
  // ponytail: in true kiosk deployment the session manager relaunches the app on exit
  app.quit();
});

app.on('second-instance', () => {
  // Second launch attempt: do nothing — single-instance lock already handled it
});

