import { ipcMain, BrowserWindow, app, shell } from 'electron';
import { IPC } from '../../shared/types';
import { runReadinessChecks } from '../readiness/checks';

// ponytail: invigilator exit PIN is hardcoded for MVP. Replace with fetching from API policy in production.
const EXIT_PIN = process.env.INVIGILATOR_PIN ?? '1234';
let isExamSubmitted = false;
let isExamActive = false;
let isQuitting = false;

export function isSecurityActive(): boolean {
  return isExamActive && !isExamSubmitted && !isQuitting;
}

export function setQuitting(val: boolean): void {
  isQuitting = val;
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // Renderer asks for readiness status (shown on pre-exam splash screen)
  ipcMain.handle(IPC.GET_READINESS, async () => {
    return runReadinessChecks();
  });

  // Renderer activates security when starting exam, deactivates on submit
  ipcMain.on(IPC.SET_SECURITY_MODE, (_event, active: boolean) => {
    isExamActive = Boolean(active);
    if (isExamActive) {
      win.setClosable(false);
      win.setFullScreen(true);
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setKiosk(true);
      win.focus();
    } else {
      win.setKiosk(false);
      win.setAlwaysOnTop(false);
      win.setFullScreen(false);
      win.setClosable(true);
      win.maximize();
    }
  });

  // Allow opening external links (e.g. Admin portal in system browser)
  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return true;
    } catch (err) {
      console.warn('Failed to open external url:', err);
      return false;
    }
  });

  // Renderer notifies when exam submission has been confirmed
  ipcMain.on(IPC.NOTIFY_SUBMITTED, () => {
    isExamSubmitted = true;
    isExamActive = false;
    win.setKiosk(false);
    win.setAlwaysOnTop(false);
    win.setFullScreen(false);
    win.setClosable(true);
    win.maximize();
  });

  // Renderer requests graceful exit:
  // - Allowed without PIN once the exam has been submitted
  // - Requires invigilator PIN during an active exam
  ipcMain.handle(IPC.EXIT_KIOSK, (_event, pin?: string) => {
    if (isExamActive && !isExamSubmitted && pin !== EXIT_PIN) {
      return { ok: false, reason: 'Wrong PIN' };
    }
    // Re-enable close and quit application cleanly
    isQuitting = true;
    isExamActive = false;
    win.setClosable(true);
    win.close();
    app.quit();
    return { ok: true };
  });

  // Renderer logs a violation event (for events the renderer detects itself, e.g. heartbeat lost)
  ipcMain.on(IPC.LOG_VIOLATION, (_event, violation) => {
    console.warn('[kiosk-violation]', violation);
    // ponytail: persist violation to backend via API call — add when backend endpoint exists
  });
}

