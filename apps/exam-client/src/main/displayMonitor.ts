import { screen, type BrowserWindow } from 'electron';
import { emitSecurityEvent } from './securityEvents';

export function installDisplayMonitor(win: BrowserWindow): void {
  screen.on('display-added', (_event, display) => {
    emitSecurityEvent(win, 'DISPLAY_CHANGED', `display added: ${display.id} (${display.size.width}x${display.size.height})`);
  });
  screen.on('display-removed', (_event, display) => {
    emitSecurityEvent(win, 'DISPLAY_CHANGED', `display removed: ${display.id}`);
  });
}
