import { BrowserWindow } from 'electron';
import type { ViolationType } from '../shared/types';
import { isSecurityActive } from './ipc/channels';

// Key combos that must be blocked in kiosk mode.
// Format: { key (lowercase), modifiers that must ALL be pressed }
const BLOCKED: Array<{ key: string; ctrl?: true; shift?: true; alt?: true; meta?: true }> = [
  { key: 'f4', alt: true },           // Alt+F4 — close window
  { key: 'tab', alt: true },          // Alt+Tab — switch window
  { key: 'escape', alt: true },       // Alt+Esc
  { key: 'f5' },                      // Reload
  { key: 'r', ctrl: true },           // Ctrl+R — reload
  { key: 'r', ctrl: true, shift: true }, // Ctrl+Shift+R — hard reload
  { key: 'f11' },                     // Toggle fullscreen
  { key: 'f12' },                     // DevTools
  { key: 'i', ctrl: true, shift: true }, // DevTools (alt)
  { key: 'j', ctrl: true, shift: true }, // DevTools (alt)
  { key: 'u', ctrl: true },           // View source
  { key: 'w', ctrl: true },           // Close tab
  { key: 'q', ctrl: true },           // Quit
  { key: 'super' },                   // Super/Win key (Linux: Super_L / Super_R)
  { key: 'meta' },                    // Meta key
];

function matches(
  input: Electron.Input,
  rule: (typeof BLOCKED)[number],
): boolean {
  if (input.key.toLowerCase() !== rule.key) return false;
  if (rule.ctrl && !input.control) return false;
  if (rule.shift && !input.shift) return false;
  if (rule.alt && !input.alt) return false;
  if (rule.meta && !input.meta) return false;
  // Require that ONLY the expected modifiers are active (avoid blocking Ctrl+Shift+F5 as reload)
  return true;
}

function emitViolation(win: BrowserWindow, type: ViolationType, detail: string): void {
  if (!isSecurityActive()) return; // only an exam in progress produces violations
  win.webContents.send('desktop:security-event', { type, detail, ts: Date.now() });
}

export function installInputGuard(win: BrowserWindow): void {
  // before-input-event fires before the web page sees the key — perfect for blocking
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // DevTools shortcut detection
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      emitViolation(win, 'DEVTOOLS_ATTEMPT', input.key);
      if (isSecurityActive()) {
        event.preventDefault();
        return;
      }
    }

    for (const rule of BLOCKED) {
      if (matches(input, rule)) {
        emitViolation(win, 'BLOCKED_SHORTCUT', `${input.key}`);
        if (isSecurityActive()) {
          event.preventDefault();
        }
        return;
      }
    }
  });
}

