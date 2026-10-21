// Run with: npm test --workspace=@secure-exam/exam-client-desktop
// Compares the key policy against the shortcuts that matter on macOS and Ubuntu.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockedKey, describeShortcut } from '../dist/main/keyPolicy.js';

const press = (code, mods = {}, key = code.replace(/^Key/, '').toLowerCase()) => ({
  key,
  code,
  control: !!mods.ctrl,
  meta: !!mods.meta,
  alt: !!mods.alt,
  shift: !!mods.shift,
});
const MAC = 'darwin';
const LINUX = 'linux';

test('reload is blocked with every modifier on both systems', () => {
  for (const platform of [MAC, LINUX]) {
    assert.ok(blockedKey(press('KeyR', { meta: true }), platform), `Cmd+R on ${platform}`);
    assert.ok(blockedKey(press('KeyR', { ctrl: true }), platform), `Ctrl+R on ${platform}`);
    assert.ok(blockedKey(press('KeyR', { meta: true, shift: true }), platform), `Cmd+Shift+R on ${platform}`);
    assert.ok(blockedKey(press('KeyR', { ctrl: true, shift: true }), platform), `Ctrl+Shift+R on ${platform}`);
    assert.ok(blockedKey(press('F5'), platform), `F5 on ${platform}`);
    assert.ok(blockedKey(press('F5', { ctrl: true }), platform), `Ctrl+F5 on ${platform}`);
  }
});

test('quit and close are blocked on both systems', () => {
  for (const platform of [MAC, LINUX]) {
    for (const mods of [{ meta: true }, { ctrl: true }]) {
      assert.ok(blockedKey(press('KeyQ', mods), platform), `Q ${platform}`);
      assert.ok(blockedKey(press('KeyW', mods), platform), `W ${platform}`);
      assert.ok(blockedKey(press('KeyN', mods), platform), `N ${platform}`);
      assert.ok(blockedKey(press('KeyT', mods), platform), `T ${platform}`);
    }
  }
  assert.equal(blockedKey(press('F4', { alt: true }), LINUX)?.label, 'Alt+F4');
  assert.equal(blockedKey(press('F4', { alt: true }), MAC)?.label, 'Option+F4');
});

test('developer tools: even when Option changes the produced character', () => {
  const macDevtools = { ...press('KeyI', { meta: true, alt: true }), key: 'ˆ' };
  assert.equal(blockedKey(macDevtools, MAC)?.kind, 'devtools');
  assert.equal(blockedKey(press('KeyI', { ctrl: true, shift: true }), LINUX)?.kind, 'devtools');
  assert.equal(blockedKey(press('KeyI', { meta: true, shift: true }), MAC)?.kind, 'devtools');
  assert.equal(blockedKey(press('KeyJ', { ctrl: true, shift: true }), LINUX)?.kind, 'devtools');
  assert.equal(blockedKey(press('F12'), LINUX)?.kind, 'devtools');
  assert.equal(blockedKey(press('F12'), MAC)?.kind, 'devtools');
});

test('window switching and system keys', () => {
  assert.ok(blockedKey(press('Tab', { alt: true }), LINUX));
  assert.ok(blockedKey(press('Tab', { meta: true }), MAC));
  assert.ok(blockedKey(press('Tab', { ctrl: true }), LINUX));
  assert.ok(blockedKey(press('KeyT', { ctrl: true, alt: true }), LINUX)); // Ubuntu terminal
  assert.ok(blockedKey(press('KeyL', { ctrl: true, alt: true }), LINUX)); // lock screen
  assert.ok(blockedKey(press('KeyH', { meta: true }), MAC));
  assert.ok(blockedKey(press('KeyM', { meta: true }), MAC));
  assert.ok(blockedKey(press('KeyF', { meta: true, ctrl: true }), MAC)); // full-screen toggle
  assert.ok(blockedKey(press('Digit4', { meta: true, shift: true }), MAC)); // screenshot
  assert.ok(blockedKey(press('PrintScreen'), LINUX));
});

test('the Super key is blocked on Linux but Cmd alone is allowed on macOS', () => {
  assert.ok(blockedKey({ ...press('MetaLeft', { meta: true }), key: 'Meta' }, LINUX));
  assert.ok(blockedKey(press('KeyD', { meta: true }), LINUX)); // Super+D
  assert.equal(blockedKey({ ...press('MetaLeft', { meta: true }), key: 'Meta' }, MAC), null);
});

test('zoom is blocked', () => {
  assert.ok(blockedKey(press('Equal', { ctrl: true }), LINUX));
  assert.ok(blockedKey(press('Minus', { meta: true }), MAC));
  assert.ok(blockedKey(press('Digit0', { ctrl: true }), LINUX));
});

test('editing shortcuts and typing stay allowed', () => {
  for (const platform of [MAC, LINUX]) {
    const mod = platform === MAC ? { meta: true } : { ctrl: true };
    for (const code of ['KeyC', 'KeyV', 'KeyX', 'KeyA', 'KeyZ', 'KeyY', 'KeyF', 'KeyD', 'KeyB', 'Slash']) {
      assert.equal(blockedKey(press(code, mod), platform), null, `${code} on ${platform}`);
    }
    assert.equal(blockedKey(press('KeyZ', { ...mod, shift: true }), platform), null); // redo
    assert.equal(blockedKey(press('KeyA'), platform), null);
    assert.equal(blockedKey(press('Enter'), platform), null);
    assert.equal(blockedKey(press('Space'), platform), null);
    assert.equal(blockedKey(press('ArrowLeft', mod), platform), null); // line start / word jump
    assert.equal(blockedKey(press('Backspace', mod), platform), null);
  }
  assert.equal(blockedKey(press('ArrowLeft', { alt: true }), MAC), null); // Option+Left = word jump
  assert.ok(blockedKey(press('ArrowLeft', { alt: true }), LINUX)); // history back
});

test('AltGr (reported as Ctrl+Alt) can still type brackets on non-US layouts', () => {
  // German layout: AltGr+7 = {, AltGr+8 = [, AltGr+9 = ], AltGr+0 = }, AltGr+Q = @
  for (const code of ['Digit7', 'Digit8', 'Digit9', 'Digit0', 'KeyQ']) {
    assert.equal(blockedKey(press(code, { ctrl: true, alt: true }), LINUX), null, code);
  }
});

test('labels name the keys the way each system does', () => {
  assert.equal(describeShortcut(press('KeyR', { meta: true }), MAC), 'Cmd+R');
  assert.equal(describeShortcut(press('KeyR', { ctrl: true, shift: true }), LINUX), 'Ctrl+Shift+R');
  assert.equal(describeShortcut(press('KeyD', { meta: true }), LINUX), 'Super+D');
});
