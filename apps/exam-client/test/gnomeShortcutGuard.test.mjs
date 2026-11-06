import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { GnomeShortcutGuard } from '../dist/main/platform/gnomeShortcutGuard.js';

const require = createRequire(import.meta.url);
const subprocess = require('node:child_process');

function setup(t, ready = true) {
  const oldDesktop = process.env.XDG_CURRENT_DESKTOP;
  const oldKiosk = process.env.EXAM_KIOSK_SESSION;
  process.env.XDG_CURRENT_DESKTOP = 'ubuntu:GNOME';
  delete process.env.EXAM_KIOSK_SESSION;
  t.after(() => {
    if (oldDesktop === undefined) delete process.env.XDG_CURRENT_DESKTOP;
    else process.env.XDG_CURRENT_DESKTOP = oldDesktop;
    if (oldKiosk === undefined) delete process.env.EXAM_KIOSK_SESSION;
    else process.env.EXAM_KIOSK_SESSION = oldKiosk;
  });
  const children = [];
  t.mock.method(subprocess, 'spawn', () => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
    children.push(child);
    child.stdin.on('finish', () => setImmediate(() => child.emit('exit', 0)));
    setImmediate(() => {
      child.stdout.write(JSON.stringify(ready ? { ok: true } : { ok: false, reason: 'Settings locked' }) + '\n');
      if (!ready) child.emit('exit', 1);
    });
    return child;
  });
  const failures = [];
  const guard = new GnomeShortcutGuard('/tmp/unused-shortcut-test', reason => failures.push(reason));
  return { guard, children, failures };
}

test('GNOME guard waits for restoration before a rapid retry acquires a new lease', { skip: process.platform !== 'linux' }, async t => {
  const { guard, children } = setup(t);
  await guard.acquire();
  assert.equal(children.length, 1);
  const stopping = guard.release();
  const restarting = guard.acquire();
  await stopping;
  await restarting;
  assert.equal(children.length, 2);
  assert.equal(children[0].stdin.writableEnded, true);
  assert.equal(children[1].stdin.writableEnded, false);
  await guard.release();
});

test('GNOME guard rejects a failed setup instead of claiming protection', { skip: process.platform !== 'linux' }, async t => {
  const { guard } = setup(t, false);
  await assert.rejects(guard.acquire(), /Settings locked/);
  await guard.release();
});

test('GNOME worker loss is reported and a later acquisition starts a fresh worker', { skip: process.platform !== 'linux' }, async t => {
  const { guard, children, failures } = setup(t);
  await guard.acquire();
  children[0].emit('exit', 1);
  assert.equal(failures.length, 1);
  await guard.acquire();
  assert.equal(children.length, 2);
  await guard.release();
});
