import { screen, BrowserWindow } from 'electron';

export function installDisplayMonitor(win: BrowserWindow): void {
  screen.on('display-added', (_event, display) => {
    win.webContents.send('desktop:security-event', {
      type: 'DISPLAY_CHANGED',
      detail: `display added: ${display.id} (${display.size.width}x${display.size.height})`,
      ts: Date.now(),
    });
  });

  screen.on('display-removed', (_event, display) => {
    win.webContents.send('desktop:security-event', {
      type: 'DISPLAY_CHANGED',
      detail: `display removed: ${display.id}`,
      ts: Date.now(),
    });
  });
}

