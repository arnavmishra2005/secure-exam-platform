import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '../../shared/types';
import { runReadinessChecks } from '../readiness/checks';

// ponytail: invigilator exit PIN is hardcoded for MVP. Replace with fetching from API policy in production.
const EXIT_PIN = process.env.INVIGILATOR_PIN ?? '1234';

export function registerIpcHandlers(win: BrowserWindow): void {
  // Renderer asks for readiness status (shown on pre-exam splash screen)
  ipcMain.handle(IPC.GET_READINESS, async () => {
    return runReadinessChecks();
  });

  // Renderer requests graceful exit (invigilator PIN protected)
  ipcMain.handle(IPC.EXIT_KIOSK, (_event, pin: string) => {
    if (pin !== EXIT_PIN) {
      return { ok: false, reason: 'Wrong PIN' };
    }
    // Re-enable close so we can quit
    win.setClosable(true);
    win.destroy();
    return { ok: true };
  });

  // Renderer logs a violation event (for events the renderer detects itself, e.g. heartbeat lost)
  ipcMain.on(IPC.LOG_VIOLATION, (_event, violation) => {
    console.warn('[kiosk-violation]', violation);
    // ponytail: persist violation to backend via API call — add when backend endpoint exists
  });
}

