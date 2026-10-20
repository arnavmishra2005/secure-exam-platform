import { contextBridge, ipcRenderer } from 'electron';
import type { ReadinessResult, SecurityEvent, ViolationType } from '../shared/types';

// Inlined IPC channel names — sandboxed Electron preload cannot require() relative files
const IPC = {
  GET_READINESS: 'desktop:get-readiness',
  EXIT_KIOSK: 'desktop:exit-kiosk',
  LOG_VIOLATION: 'desktop:log-violation',
  SECURITY_EVENT: 'desktop:security-event',
} as const;

// Expose a minimal, typed window.desktop API to the renderer.
// contextIsolation: true ensures renderer JS cannot access Node/Electron directly.
contextBridge.exposeInMainWorld('desktop', {
  /** Returns true when running inside the Electron kiosk shell. */
  isDesktop: () => true,

  /** Run all pre-exam readiness checks (display count, backend, processes). */
  getReadiness: (): Promise<ReadinessResult> =>
    ipcRenderer.invoke(IPC.GET_READINESS),

  /** Exit kiosk — requires invigilator PIN. Returns { ok, reason? }. */
  exitKiosk: (pin: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke(IPC.EXIT_KIOSK, pin),

  /** Log a violation event that the renderer detected (e.g. HEARTBEAT_LOST). */
  logViolation: (type: ViolationType, detail?: string): void =>
    ipcRenderer.send(IPC.LOG_VIOLATION, { type, detail, ts: Date.now() }),

  /** Subscribe to security events pushed from the main process. Returns unsubscribe fn. */
  onSecurityEvent: (cb: (event: SecurityEvent) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: SecurityEvent) => cb(event);
    ipcRenderer.on(IPC.SECURITY_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC.SECURITY_EVENT, handler);
  },
});

