// Every security event during an exam goes through here.
//
// 1. It is pushed to the page, so the student sees a warning banner.
// 2. It is kept in a buffer in this (main) process. The page drains the buffer
//    and sends it to the API. Because the buffer lives here, an event is not
//    lost if the page reloads or crashes before it could be reported.
//
// Nothing is recorded outside an exam: the dashboard and login screens are
// ordinary app screens.

import type { BrowserWindow } from 'electron';
import type { SecurityEvent, ViolationType } from '../shared/types';
import { isSecurityActive } from './examState';

const MAX_BUFFERED = 500;
const buffer: SecurityEvent[] = [];

export function emitSecurityEvent(win: BrowserWindow | null, type: ViolationType, detail?: string): void {
  if (!isSecurityActive()) return;
  const event: SecurityEvent = { type, detail, ts: Date.now() };
  buffer.push(event);
  if (buffer.length > MAX_BUFFERED) buffer.shift();
  if (win && !win.isDestroyed()) win.webContents.send('desktop:security-event', event);
}

/** Returns every event not yet reported and empties the buffer. */
export function drainSecurityEvents(): SecurityEvent[] {
  return buffer.splice(0, buffer.length);
}
