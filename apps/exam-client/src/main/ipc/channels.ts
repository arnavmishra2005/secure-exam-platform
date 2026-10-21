import { ipcMain, BrowserWindow, app, shell } from 'electron';
import { IPC } from '../../shared/types';
import { runReadinessChecks } from '../readiness/checks';
import { IS_DEV } from '../config';
import { runCode, type LocalRunJob } from '../runner/localRunner';

// ponytail: the invigilator exit PIN comes from the environment for now; fetch it from the API policy later.
// There is no default outside development: without INVIGILATOR_PIN nobody can leave mid-exam except by submitting.
const EXIT_PIN = process.env.INVIGILATOR_PIN ?? (IS_DEV ? '1234' : undefined);
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
      isExamSubmitted = false; // a new exam in the same app session must lock again
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
    if (isExamActive && !isExamSubmitted && (!EXIT_PIN || pin !== EXIT_PIN)) {
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

  // Run the student's Python locally. Failures of the program are normal outcomes; the
  // promise rejects only when the runner itself cannot work.
  ipcMain.handle(IPC.RUN_CODE, (_event, job: LocalRunJob) =>
    runCode(job, { allowUnsandboxed: IS_DEV && process.env.EXAM_UNSANDBOXED_RUNNER === '1' }),
  );

  // Renderer logs a violation event (for events the renderer detects itself, e.g. heartbeat lost)
  ipcMain.on(IPC.LOG_VIOLATION, (_event, violation) => {
    console.warn('[kiosk-violation]', violation);
    // ponytail: persist violation to backend via API call — add when backend endpoint exists
  });
}

