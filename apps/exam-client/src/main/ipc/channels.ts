import { ipcMain, BrowserWindow, app, shell, globalShortcut } from 'electron';
import { IPC, type ViolationType } from '../../shared/types';
import { GnomeShortcutGuard } from '../platform/gnomeShortcutGuard';
import { createWindowLockdown } from '../windowLockdown';
import { API_URL, IS_DEV } from '../config';
import { isExamActive, isExamSubmitted, isSecurityActive, setExamActive, setExamSubmitted, setQuitting } from '../examState';
import { getLaunchToken, setLaunchToken } from '../launchState';
import { runReadinessChecks } from '../readiness/checks';
import { runCode, type LocalRunJob } from '../runner/localRunner';
import { drainSecurityEvents, emitSecurityEvent } from '../securityEvents';

// ponytail: the invigilator exit PIN comes from the environment for now; fetch it from the API policy later.
// There is no default outside development: without INVIGILATOR_PIN nobody can leave mid-exam except by submitting.
const EXIT_PIN = process.env.INVIGILATOR_PIN ?? (IS_DEV ? '1234' : undefined);

/** Violation types the page may report itself (the rest are raised by the main process). */
const RENDERER_REPORTABLE = new Set<ViolationType>(['CLIPBOARD_BLOCKED', 'HEARTBEAT_LOST', 'KIOSK_CHECK_FAILED']);

/** If the page cannot close the app (a crash, a stuck screen), this does, shortly after the exam. */
const FALLBACK_QUIT_AFTER_SUBMIT_MS = 45_000;
let fallbackQuit: NodeJS.Timeout | null = null;

export function registerIpcHandlers(win: BrowserWindow): () => void {
  let interrupted = false;
  let interruptTimer: ReturnType<typeof setTimeout> | undefined;
  function closeInterruptedExam() {
    if (!interrupted || win.isDestroyed()) return;
    securityGeneration++;
    setQuitting(true);
    setExamActive(false);
    lockdown.release();
    void shortcuts.release();
    win.setClosable(true);
    win.close();
    app.quit();
  }
  function interruptExam() {
    if (!isSecurityActive() || interrupted) return;
    interrupted = true;
    emitSecurityEvent(win, 'BLOCKED_SHORTCUT', 'Ctrl+Alt+Delete: exam interrupted; invigilator approval is required to resume.');
    // Give the renderer time to send the audit event before exit. Never submit
    // the attempt: the existing launch approval flow controls re-entry.
    interruptTimer = setTimeout(closeInterruptedExam, 8_000);
  }
  const lockdown = createWindowLockdown(win, globalShortcut, isSecurityActive,
    detail => emitSecurityEvent(win, 'BLOCKED_SHORTCUT', detail), process.platform, interruptExam);
  const shortcuts = new GnomeShortcutGuard(app.getPath('userData'), reason => emitSecurityEvent(win, 'KIOSK_CHECK_FAILED', reason));
  let recoveryError: string | null = null;
  let securityGeneration = 0;
  const recovered = shortcuts.recover().catch(error => { recoveryError = String(error); });
  app.on('will-quit', () => { lockdown.release(); void shortcuts.release(); });
  win.on('closed', () => { clearTimeout(interruptTimer); securityGeneration++; void shortcuts.release(); });
  const prepareSecurity = async () => {
    const generation = ++securityGeneration;
    const wasActive = isSecurityActive();
    try {
      await recovered;
      if (recoveryError) throw new Error(recoveryError);
      await shortcuts.acquire();
      if (generation !== securityGeneration) return { ok: false, reason: 'Security setup cancelled' };
      setExamActive(true);
      lockdown.lock();
      // Native fullscreen is asynchronous; require confirmation before starting an attempt.
      for (let retry = 0; retry < 30 && !win.isDestroyed() && !win.isFullScreen(); retry++) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (generation !== securityGeneration) return { ok: false, reason: 'Security setup cancelled' };
      if (win.isDestroyed() || !win.isFullScreen()) throw new Error('Could not enter fullscreen. Close the app and ask the invigilator to check the desktop session.');
      return { ok: true };
    } catch (error) {
      if (generation !== securityGeneration) return { ok: false, reason: 'Security setup cancelled' };
      await shortcuts.release();
      if (generation !== securityGeneration) return { ok: false, reason: 'Security setup cancelled' };
      const reason = error instanceof Error ? error.message : String(error);
      if (wasActive) {
        emitSecurityEvent(win, 'KIOSK_CHECK_FAILED', reason);
      } else {
        setExamActive(false);
        lockdown.unlock();
      }
      return { ok: false, reason };
    }
  };
  ipcMain.handle('desktop:prepare-exam-security', prepareSecurity);
  ipcMain.handle('desktop:get-api-base-url', () => API_URL);
  // Pre-exam readiness (single display, server reachable, no forbidden apps).
  ipcMain.handle(IPC.GET_READINESS, () => runReadinessChecks());

  // The exam screen locks the window when an attempt is running.
  ipcMain.on(IPC.SET_SECURITY_MODE, (_event, active: boolean) => {
    const wasLocked = isSecurityActive();
    setExamActive(Boolean(active));
    if (isSecurityActive()) {
      void prepareSecurity();
    } else {
      securityGeneration++;
      if (wasLocked) lockdown.unlock();
      void shortcuts.release();
    }
  });

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url: string) => {
    if (isSecurityActive()) {
      emitSecurityEvent(win, 'NAV_BLOCKED', 'External link blocked during exam');
      return false;
    }
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

  // The page confirms the submission. The exam is over, but the app is not a general
  // window: it stays full screen on the "submitted" message and can only be closed.
  // The shortcut blocking ends (nothing left to protect); closing is now allowed.
  ipcMain.on(IPC.NOTIFY_SUBMITTED, () => {
    securityGeneration++;
    setExamSubmitted();
    lockdown.release();
    void shortcuts.release();
    win.setClosable(true);
    fallbackQuit ??= setTimeout(() => {
      setQuitting(true);
      app.quit();
    }, FALLBACK_QUIT_AFTER_SUBMIT_MS);
  });

  ipcMain.handle(IPC.GET_LAUNCH_TOKEN, () => getLaunchToken());
  ipcMain.on(IPC.CLEAR_LAUNCH_TOKEN, () => setLaunchToken(null));

  // Leaving the exam app. Free after submission; needs the invigilator PIN during an exam.
  ipcMain.handle(IPC.EXIT_KIOSK, (_event, pin?: string) => {
    if (interrupted) { closeInterruptedExam(); return { ok: true }; }
    if (isExamActive() && !isExamSubmitted() && (!EXIT_PIN || pin !== EXIT_PIN)) {
      emitSecurityEvent(win, 'BLOCKED_SHORTCUT', 'Exit attempted with a wrong or missing invigilator PIN');
      return { ok: false, reason: 'Wrong PIN' };
    }
    securityGeneration++;
    setQuitting(true); // from here on the window may close and the app may quit
    setExamActive(false);
    lockdown.release();
    void shortcuts.release();
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
  return interruptExam;
}
