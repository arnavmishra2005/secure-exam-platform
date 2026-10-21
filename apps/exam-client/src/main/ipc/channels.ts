import { ipcMain, BrowserWindow, app, shell } from 'electron';
import { IPC, type ViolationType } from '../../shared/types';
import { IS_DEV } from '../config';
import { isExamActive, isExamSubmitted, isSecurityActive, setExamActive, setExamSubmitted, setQuitting } from '../examState';
import { runReadinessChecks } from '../readiness/checks';
import { runCode, type LocalRunJob } from '../runner/localRunner';
import { drainSecurityEvents, emitSecurityEvent } from '../securityEvents';

// ponytail: the invigilator exit PIN comes from the environment for now; fetch it from the API policy later.
// There is no default outside development: without INVIGILATOR_PIN nobody can leave mid-exam except by submitting.
const EXIT_PIN = process.env.INVIGILATOR_PIN ?? (IS_DEV ? '1234' : undefined);

/** Violation types the page may report itself (the rest are raised by the main process). */
const RENDERER_REPORTABLE = new Set<ViolationType>(['CLIPBOARD_BLOCKED', 'HEARTBEAT_LOST', 'KIOSK_CHECK_FAILED']);

function lock(win: BrowserWindow): void {
  win.setClosable(false);
  win.setFullScreen(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setKiosk(true);
  win.focus();
}

function unlock(win: BrowserWindow): void {
  win.setKiosk(false);
  win.setAlwaysOnTop(false);
  win.setFullScreen(false);
  win.setClosable(true);
  win.maximize();
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // Pre-exam readiness (single display, server reachable, no forbidden apps).
  ipcMain.handle(IPC.GET_READINESS, () => runReadinessChecks());

  // The exam screen locks the window when an attempt is running.
  ipcMain.on(IPC.SET_SECURITY_MODE, (_event, active: boolean) => {
    const wasLocked = isSecurityActive();
    setExamActive(Boolean(active));
    if (isSecurityActive()) {
      lock(win);
    } else if (wasLocked) {
      unlock(win);
    }
  });

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url: string) => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol !== 'https:' && protocol !== 'http:') return false; // never hand arbitrary schemes to the OS
      await shell.openExternal(url);
      return true;
    } catch (err) {
      console.warn('Failed to open external url:', err);
      return false;
    }
  });

  // The page confirms the submission: release the lockdown.
  ipcMain.on(IPC.NOTIFY_SUBMITTED, () => {
    setExamSubmitted();
    unlock(win);
  });

  // Leaving the exam app. Free after submission; needs the invigilator PIN during an exam.
  ipcMain.handle(IPC.EXIT_KIOSK, (_event, pin?: string) => {
    if (isExamActive() && !isExamSubmitted() && (!EXIT_PIN || pin !== EXIT_PIN)) {
      emitSecurityEvent(win, 'BLOCKED_SHORTCUT', 'Exit attempted with a wrong or missing invigilator PIN');
      return { ok: false, reason: 'Wrong PIN' };
    }
    setQuitting(true); // from here on the window may close and the app may quit
    setExamActive(false);
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

  // Events the page detects itself (a blocked paste in the editor, a lost heartbeat).
  ipcMain.on(IPC.LOG_VIOLATION, (_event, violation: { type?: ViolationType; detail?: unknown }) => {
    if (!violation?.type || !RENDERER_REPORTABLE.has(violation.type)) return;
    const detail = typeof violation.detail === 'string' ? violation.detail.slice(0, 300) : undefined;
    emitSecurityEvent(win, violation.type, detail);
  });

  // The page collects the buffered events and sends them to the API.
  ipcMain.handle(IPC.DRAIN_EVENTS, () => drainSecurityEvents());
}
