import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createWindowLockdown, escapeAccelerators, LOCK_SETTLE_MS, RESTORE_SETTLE_MS } from '../dist/main/windowLockdown.js';

function setup(platform = 'linux') {
  const win = new EventEmitter();
  const state = { active: true, destroyed: false, minimized: false, visible: true, kiosk: false, fullscreen: false, focused: true };
  const calls = [];
  Object.assign(win, {
    isDestroyed: () => state.destroyed, isMinimized: () => state.minimized, isFocused: () => state.focused,
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
  const presence = [];
  const lock = createWindowLockdown(win, shortcuts, () => state.active, detail => reports.push(detail), platform, () => interruptions.push(true), {
    left: detail => presence.push(['left', detail]),
    back: () => presence.push(['back']),
    settle: ms => presence.push(['settle', ms]),
    reset: () => presence.push(['reset']),
  });
  return { win, state, calls, bindings, reports, lock, interruptions, presence };
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

test('locking settles window events first, so the transition itself is not a violation', () => {
  const { presence, lock } = setup();
  lock.lock();
  assert.deepEqual(presence.slice(0, 2), [['reset'], ['settle', LOCK_SETTLE_MS]]);
  assert.ok(!presence.some(([kind]) => kind === 'left'));
});

test('window escapes are a departure from the window, never a blocked key combination', async () => {
  const { win, state, reports, presence, lock } = setup();
  lock.lock();
  presence.length = 0;
  state.minimized = true;
  win.emit('minimize');
  win.emit('leave-full-screen');
  assert.deepEqual(reports, []);
  assert.deepEqual(presence.filter(([kind]) => kind === 'left'), [['left', 'Exam window minimized'], ['left', 'Exam window left full screen']]);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.ok(presence.some(([kind, ms]) => kind === 'settle' && ms === RESTORE_SETTLE_MS));
  assert.deepEqual(presence.at(-1), ['back']);
  lock.release();
});

test('macOS: hide (the window being covered) restores the window but is not recorded', async () => {
  const { win, state, reports, presence, lock } = setup('darwin');
  lock.lock();
  presence.length = 0;
  state.visible = false;
  win.emit('hide');
  assert.deepEqual(reports, []);
  assert.ok(!presence.some(([kind]) => kind === 'left'));
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(state.visible, true);
  lock.release();
});

test('Linux: hide is recorded as leaving the window', () => {
  const { win, presence, lock } = setup('linux');
  lock.lock();
  win.emit('hide');
  assert.ok(presence.some(([kind, detail]) => kind === 'left' && detail === 'Exam window hidden'));
  lock.release();
});
