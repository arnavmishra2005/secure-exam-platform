import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { setExamActive } from '../dist/main/examState.js';
import { installFocusMonitor } from '../dist/main/focusMonitor.js';

class MockWindow extends EventEmitter {
  destroyed = false;
  minimized = true;
  fullscreen = false;
  kiosk = false;
  alwaysOnTop = false;
  restoreCount = 0;
  focusCount = 0;

  isDestroyed() { return this.destroyed; }
  isMinimized() { return this.minimized; }
  restore() { this.minimized = false; this.restoreCount += 1; }
  isFullScreen() { return this.fullscreen; }
  setFullScreen(value) { this.fullscreen = value; }
  isKiosk() { return this.kiosk; }
  setKiosk(value) { this.kiosk = value; }
  isAlwaysOnTop() { return this.alwaysOnTop; }
  setAlwaysOnTop(value) { this.alwaysOnTop = value; }
  focus() { this.focusCount += 1; }
  webContents = { send() {} };
}

test('Windows exam window restores after minimize and reasserts kiosk state', async () => {
  const win = new MockWindow();
  setExamActive(true);
  installFocusMonitor(win, 'win32');

  win.emit('minimize');

  await new Promise((resolve) => setTimeout(resolve, 10));
  setExamActive(false);

  assert.equal(win.restoreCount, 1);
  assert.equal(win.fullscreen, true);
  assert.equal(win.kiosk, true);
  assert.equal(win.alwaysOnTop, true);
  assert.ok(win.focusCount > 0);

  win.fullscreen = false;
  win.kiosk = false;
  win.alwaysOnTop = false;
  setExamActive(true);
  win.emit('leave-full-screen');
  await new Promise((resolve) => setTimeout(resolve, 10));
  setExamActive(false);

  assert.equal(win.fullscreen, true);
  assert.equal(win.kiosk, true);
  assert.equal(win.alwaysOnTop, true);
});

test('minimize and fullscreen guards are not installed on macOS or Linux', () => {
  for (const platform of ['darwin', 'linux']) {
    const win = new MockWindow();
    installFocusMonitor(win, platform);
    assert.equal(win.listenerCount('minimize'), 0, platform);
    assert.equal(win.listenerCount('leave-full-screen'), 0, platform);
  }
});

test('Windows blur restores focus and exam window state', async () => {
  const win = new MockWindow();
  win.minimized = false;
  setExamActive(true);
  installFocusMonitor(win, 'win32');

  win.emit('blur');
  await new Promise((resolve) => setTimeout(resolve, 220));
  setExamActive(false);

  assert.equal(win.fullscreen, true);
  assert.equal(win.kiosk, true);
  assert.equal(win.alwaysOnTop, true);
  assert.ok(win.focusCount > 0);
});

test('Windows blur enforcement safely skips a destroyed window', async () => {
  const win = new MockWindow();
  setExamActive(true);
  installFocusMonitor(win, 'win32');

  win.emit('blur');
  win.destroyed = true;
  await new Promise((resolve) => setTimeout(resolve, 220));
  setExamActive(false);

  assert.equal(win.restoreCount, 0);
  assert.equal(win.fullscreen, false);
  assert.equal(win.kiosk, false);
  assert.equal(win.alwaysOnTop, false);
  assert.equal(win.focusCount, 0);
});
