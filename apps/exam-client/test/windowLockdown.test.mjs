import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createWindowLockdown, escapeAccelerators } from '../dist/main/windowLockdown.js';

function setup() {
  const win = new EventEmitter();
  const state = { active: true, destroyed: false, minimized: false, visible: true, kiosk: false, fullscreen: false };
  const calls = [];
  Object.assign(win, {
    isDestroyed: () => state.destroyed, isMinimized: () => state.minimized,
    isVisible: () => state.visible, isKiosk: () => state.kiosk, isFullScreen: () => state.fullscreen,
    restore: () => { state.minimized = false; }, show: () => { state.visible = true; },
    setKiosk: value => { calls.push(['setKiosk', value]); state.kiosk = value; }, setFullScreen: value => { calls.push(['setFullScreen', value]); state.fullscreen = value; },
    webContents: { closeDevTools: () => calls.push(['closeDevTools']) },
  });
  for (const name of ['setClosable', 'setMinimizable', 'setMaximizable', 'setResizable', 'setMovable', 'setSkipTaskbar', 'setAlwaysOnTop', 'moveTop', 'focus', 'maximize']) {
    win[name] = (...args) => calls.push([name, ...args]);
  }
  const bindings = new Map();
  const shortcuts = { register: (key, callback) => { bindings.set(key, callback); return true; }, unregister: key => bindings.delete(key) };
  const reports = [];
  const interruptions = [];
  const lock = createWindowLockdown(win, shortcuts, () => state.active, detail => reports.push(detail), 'linux', () => interruptions.push(true));
  return { win, state, calls, bindings, reports, lock, interruptions };
}

test('locks window controls and reserves common desktop escape shortcuts only while taking the exam', () => {
  const { state, calls, bindings, lock } = setup();
  lock.lock();
  assert.equal(state.kiosk, true);
  assert.equal(state.fullscreen, true);
  assert.ok(calls.findIndex(call => call[0] === 'setFullScreen') < calls.findIndex(call => call[0] === 'setKiosk'));
  for (const name of ['setMinimizable', 'setMovable', 'setClosable']) {
    assert.ok(calls.some(call => call[0] === name && call[1] === false));
  }
  assert.ok(calls.some(call => call[0] === 'setResizable' && call[1] === true));
  assert.ok(!calls.some(call => call[0] === 'setResizable' && call[1] === false));
  assert.ok(bindings.has('Super+D'));
  assert.ok(bindings.has('Super+M'));
  assert.ok(bindings.has('Alt+Tab'));
  // Never seize ordinary typing/editing shortcuts globally.
  assert.ok(!bindings.has('Control+C'));
  state.active = false;
  lock.unlock();
  assert.equal(bindings.size, 0);
  assert.equal(state.kiosk, false);
  assert.equal(state.fullscreen, false);
});

test('minimise/hide/fullscreen escape restores the exam window, with coalesced recovery', async () => {
  const { win, state, calls, bindings, lock } = setup();
  lock.lock();
  state.minimized = true; state.visible = false; state.fullscreen = false;
  win.emit('minimize'); win.emit('hide'); win.emit('leave-full-screen');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(state.minimized, false);
  assert.equal(state.visible, true);
  assert.equal(state.fullscreen, true);
  assert.ok(calls.some(call => call[0] === 'focus'));
  win.emit('closed');
  assert.equal(bindings.size, 0);
});

test('release cancels delayed recovery and releases only shortcuts owned by this guard', async () => {
  const { win, state, bindings, lock } = setup();
  bindings.set('Control+F8', () => {});
  lock.lock();
  state.minimized = true;
  win.emit('minimize');
  state.active = false;
  lock.release();
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(state.minimized, true);
  assert.deepEqual([...bindings.keys()], ['Control+F8']);
});

test('platform-specific list does not claim to capture secure attention keys', () => {
  assert.ok(escapeAccelerators('darwin').includes('Command+Tab'));
  assert.ok(!escapeAccelerators('win32').includes('Control+Alt+Delete'));
});

test('only Ctrl+Alt+Delete requests interruption; other escape shortcuts warn and stay fullscreen', () => {
  const { state, bindings, reports, lock, interruptions } = setup();
  lock.lock();
  for (const key of ['Alt+Tab', 'Super+D', 'Super+M', 'Alt+F4']) bindings.get(key)();
  assert.equal(interruptions.length, 0);
  assert.equal(reports.length, 4);
  assert.deepEqual(reports, ['Alt+Tab blocked during exam', 'Win+D blocked during exam',
    'Win+M blocked during exam', 'Alt+F4 blocked during exam']);
  assert.equal(state.fullscreen, true);
  bindings.get('Control+Alt+Delete')();
  assert.equal(interruptions.length, 1);
  state.active = false;
  bindings.get('Control+Alt+Delete')();
  assert.equal(interruptions.length, 1);
  lock.release();
});
