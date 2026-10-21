// Which key combinations are blocked while an exam is running.
//
// Pure functions with no Electron import, so the same rules are unit-tested
// for macOS and Linux (Ubuntu). Matching uses the PHYSICAL key (`code`, e.g.
// "KeyR") and not the produced character (`key`), because on macOS holding
// Option changes the character (Option+I types "ˆ") and would slip past a
// rule written for "i".
//
// "mod" means Ctrl OR Cmd. Allowing both on both platforms is deliberate: it
// is a superset, so a shortcut blocked on one system is blocked on the other.
// Editing shortcuts (copy, paste, undo, select all, word/line navigation)
// are never blocked: students need them, and the code editor blocks
// external paste by itself.
//
// Shortcuts handled by the operating system before the app sees them (Cmd+Tab,
// Alt+Tab, Cmd+Space, Ctrl+Alt+F1..F7, Ctrl+Alt+Del, ...) cannot be blocked
// here. The kiosk session (infra/linux-kiosk) and macOS kiosk presentation
// options cover those, and focus-loss events record any attempt.

export interface KeyInput {
  /** Produced character, e.g. "r" or "ˆ". */
  key: string;
  /** Physical key, e.g. "KeyR", "F5", "Tab". */
  code: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export type Platform = 'darwin' | 'linux' | 'win32' | string;

export interface BlockedKey {
  /** Human-readable, e.g. "Cmd+R" or "Ctrl+Shift+I". Goes into the audit log. */
  label: string;
  kind: 'shortcut' | 'devtools';
}

const MOD_KEYS = new Set([
  'KeyR', // reload
  'KeyW', // close window/tab
  'KeyQ', // quit
  'KeyN', // new window
  'KeyT', // new tab
  'KeyP', // print
  'KeyS', // save page
  'KeyO', // open file
  'KeyU', // view source
  'KeyJ', // downloads
  'Tab', // next tab
  'PageUp',
  'PageDown',
  'F4', // close tab
  'F5', // reload
  'Digit0', // reset zoom
  'Equal', // zoom in
  'Minus', // zoom out
  'NumpadAdd',
  'NumpadSubtract',
  'Numpad0',
]);

// Ctrl/Cmd + Shift + ...
const MOD_SHIFT_KEYS = new Set([
  'KeyR', // hard reload
  'KeyN', // incognito / new window
  'KeyT', // reopen tab
  'KeyW', // close window
  'KeyQ', // log out (GNOME)
  'KeyP',
  'Delete', // clear browsing data
  'Digit3', // macOS screenshots, in case the app sees them
  'Digit4',
  'Digit5',
  'Digit6',
]);

const DEVTOOLS_MOD_SHIFT = new Set(['KeyI', 'KeyJ', 'KeyC']);
const DEVTOOLS_META_ALT = new Set(['KeyI', 'KeyJ', 'KeyC', 'KeyU']); // macOS Cmd+Option+...

// macOS-only Cmd shortcuts that would hide, minimise or move away from the app.
const META_ONLY_KEYS = new Set(['KeyH', 'KeyM', 'Comma', 'Backquote']);

// Ubuntu / GNOME style Ctrl+Alt combinations that open a terminal, lock the screen, etc.
const CTRL_ALT_KEYS = new Set(['KeyT', 'KeyL', 'Delete', 'Backspace', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']);

const ALT_KEYS = new Set(['F4', 'Tab', 'Escape', 'Space', 'F1', 'F2', 'F7', 'F8', 'F10']);

const PLAIN_KEYS = new Set(['F5', 'F11', 'F12', 'PrintScreen']);

function names(platform: Platform) {
  return platform === 'darwin'
    ? { ctrl: 'Ctrl', meta: 'Cmd', alt: 'Option', shift: 'Shift' }
    : { ctrl: 'Ctrl', meta: 'Super', alt: 'Alt', shift: 'Shift' };
}

function keyName(input: KeyInput): string {
  if (input.code.startsWith('Key')) return input.code.slice(3);
  if (input.code.startsWith('Digit')) return input.code.slice(5);
  const special: Record<string, string> = { Equal: '+', Minus: '-', Comma: ',', Backquote: '`', Escape: 'Esc' };
  return special[input.code] ?? input.code;
}

/** "Cmd+Shift+R" style label for the combination the student pressed. */
export function describeShortcut(input: KeyInput, platform: Platform): string {
  const n = names(platform);
  const parts: string[] = [];
  if (input.control) parts.push(n.ctrl);
  if (input.meta) parts.push(n.meta);
  if (input.alt) parts.push(n.alt);
  if (input.shift) parts.push(n.shift);
  const isModifierKey = /^(Control|Meta|Alt|Shift|OS)(Left|Right)?$/.test(input.code);
  if (!isModifierKey) parts.push(keyName(input));
  return parts.join('+') || input.code;
}

/** The blocked combination, or null when the key press is allowed. */
export function blockedKey(input: KeyInput, platform: Platform): BlockedKey | null {
  // Many non-US layouts report AltGr as Ctrl+Alt, and students need it to type [ ] { } in code.
  // Only the explicit Ctrl+Alt combinations below apply to it.
  const altGr = input.control && input.alt && !input.meta;
  const mod = (input.control || input.meta) && !altGr;
  const label = describeShortcut(input, platform);
  const block = (kind: BlockedKey['kind'] = 'shortcut'): BlockedKey => ({ label, kind });
  const code = input.code;

  // Developer tools: F12, Ctrl/Cmd+Shift+I/J/C, Cmd+Option+I/J/C/U.
  if (code === 'F12') return block('devtools');
  if ((input.control || input.meta) && input.shift && DEVTOOLS_MOD_SHIFT.has(code)) return block('devtools');
  if (input.meta && input.alt && DEVTOOLS_META_ALT.has(code)) return block('devtools');

  if (PLAIN_KEYS.has(code)) return block();
  if (mod && MOD_KEYS.has(code)) return block();
  if (mod && input.shift && MOD_SHIFT_KEYS.has(code)) return block();

  // macOS: Cmd+H/M/,/` and the full-screen toggle Ctrl+Cmd+F.
  if (input.meta && META_ONLY_KEYS.has(code)) return block();
  if (input.meta && input.control && code === 'KeyF') return block();

  // Alt combinations that close or switch windows. Alt+F1..: window menus.
  if (input.alt && !input.meta && !input.control && ALT_KEYS.has(code)) return block();
  // Alt+Left/Right navigate history on Linux. On macOS Option+Left/Right move by word, so leave them.
  if (platform !== 'darwin' && input.alt && (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'Home')) {
    return block();
  }

  // Ubuntu: Ctrl+Alt+T/L/Del/F1..F7.
  if (input.control && input.alt && CTRL_ALT_KEYS.has(code)) return block();

  // Linux: the Super key on its own or combined with anything opens the shell. On macOS the Cmd
  // key is held for every ordinary shortcut (Cmd+C), so pressing it alone is not a violation.
  if (platform !== 'darwin' && (input.meta || /^(Meta|OS)(Left|Right)$/.test(code))) return block();

  return null;
}
