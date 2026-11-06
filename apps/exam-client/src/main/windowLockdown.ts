import type { BrowserWindow, globalShortcut } from 'electron';
import { describeAccelerator } from './keyPolicy';

/** OS-reserved combinations may refuse registration. A real kiosk session is
 * still required to suppress shell shortcuts and secure-attention sequences. */
export function escapeAccelerators(platform: string): string[] {
  return platform === 'darwin'
    ? ['Command+Tab', 'Command+Shift+Tab', 'Command+H', 'Command+M', 'Command+Space']
    : ['Alt+Tab', 'Alt+Shift+Tab', 'Alt+Escape', 'Alt+F4', 'Alt+Space',
      'Super+D', 'Super+M', 'Super+Tab', 'Super+E', 'Super+R',
      'Super+Up', 'Super+Down', 'Super+Left', 'Super+Right',
      'Control+Alt+D', 'Control+Alt+T', 'Control+Shift+Escape',
      ...(platform === 'linux' ? ['Control+Alt+Delete'] : [])];
}

export function createWindowLockdown(
  win: BrowserWindow,
  shortcuts: Pick<typeof globalShortcut, 'register' | 'unregister'>,
  active: () => boolean,
  report: (detail: string) => void,
  platform = process.platform,
  interruptExam: () => void = () => {},
) {
  const registered = new Set<string>();
  let recovery: ReturnType<typeof setTimeout> | undefined;

  function restore() {
    if (win.isDestroyed() || !active()) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    // Linux WMs need a resizable window to negotiate fullscreen geometry.
    // Keep the pre-Phase-5 ordering: fullscreen first, then kiosk.
    if (platform === 'linux') win.setResizable(true);
    if (!win.isFullScreen()) win.setFullScreen(true);
    if (!win.isKiosk()) win.setKiosk(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
    win.focus();
  }

  function recover() {
    if (!active() || recovery) return;
    recovery = setTimeout(() => { recovery = undefined; restore(); }, 50);
  }

  // WM-driven minimise/fullscreen changes do not pass through keyboard events.
  const onEscape = (event: string) => () => {
    if (!active()) return;
    report(`Window ${event} blocked during exam`);
    recover();
  };
  win.on('minimize', onEscape('minimize'));
  win.on('hide', onEscape('hide'));
  win.on('leave-full-screen', onEscape('leave-full-screen'));
  win.on('blur', recover);
  win.on('closed', release);

  function release() {
    if (recovery) clearTimeout(recovery);
    recovery = undefined;
    for (const accelerator of registered) shortcuts.unregister(accelerator);
    registered.clear();
  }

  return {
    lock() {
      win.setClosable(false);
      win.setMinimizable(false);
      if (platform !== 'linux') {
        win.setMaximizable(false);
        win.setResizable(false);
      }
      win.setMovable(false);
      win.setSkipTaskbar(true);
      win.webContents.closeDevTools();
      restore();
      const unavailable: string[] = [];
      for (const accelerator of escapeAccelerators(platform)) {
        if (registered.has(accelerator)) continue;
        try {
          if (shortcuts.register(accelerator, () => {
            if (!active()) return;
            if (accelerator === 'Control+Alt+Delete') { interruptExam(); return; }
            report(`${describeAccelerator(accelerator, platform)} blocked during exam`);
            restore();
          })) registered.add(accelerator);
          else unavailable.push(accelerator);
        } catch { unavailable.push(accelerator); }
      }
      if (unavailable.length) console.warn('OS owns these shortcuts; use the managed kiosk session:', unavailable.join(', '));
    },
    unlock() {
      release();
      if (win.isDestroyed()) return;
      win.setKiosk(false);
      win.setAlwaysOnTop(false);
      win.setFullScreen(false);
      win.setClosable(true);
      win.setMinimizable(true);
      win.setMaximizable(true);
      win.setResizable(true);
      win.setMovable(true);
      win.setSkipTaskbar(false);
      win.maximize();
    },
    release,
  };
}
