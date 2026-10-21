import type { BrowserWindow } from 'electron';
import { isSecurityActive } from './examState';
import { blockedKey } from './keyPolicy';
import { emitSecurityEvent } from './securityEvents';

export function installInputGuard(win: BrowserWindow): void {
  // before-input-event fires before the page and before any menu accelerator,
  // so preventDefault() here stops the shortcut completely.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !isSecurityActive()) return;
    const blocked = blockedKey(
      { key: input.key, code: input.code, control: input.control, meta: input.meta, alt: input.alt, shift: input.shift },
      process.platform,
    );
    if (!blocked) return;
    event.preventDefault();
    emitSecurityEvent(win, blocked.kind === 'devtools' ? 'DEVTOOLS_ATTEMPT' : 'BLOCKED_SHORTCUT', blocked.label);
  });
}
