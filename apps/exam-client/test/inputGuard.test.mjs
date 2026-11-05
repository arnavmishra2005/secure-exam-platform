import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { installInputGuard } from '../dist/main/inputGuard.js';
import { setExamActive } from '../dist/main/examState.js';

test('ordinary escapes are blocked and reported; only Ctrl+Alt+Delete interrupts', () => {
  const contents = new EventEmitter();
  const events = [];
  contents.send = (_channel, event) => events.push(event);
  const win = { webContents: contents, isDestroyed: () => false };
  let interruptions = 0, prevented = 0;
  installInputGuard(win, () => interruptions++);
  setExamActive(true);
  try {
    const press = (code, modifiers) => contents.emit('before-input-event',
      { preventDefault: () => prevented++ }, { type: 'keyDown', key: code, code, control: false, alt: false, meta: false, shift: false, ...modifiers });
    press('Tab', { alt: true });
    press('KeyD', { meta: true });
    press('F4', { alt: true });
    assert.equal(interruptions, 0);
    assert.equal(events.length, 3);
    press('Delete', { control: true, alt: true });
    assert.equal(interruptions, 1);
    assert.equal(prevented, 4);
    setExamActive(false);
    press('Delete', { control: true, alt: true });
    assert.equal(interruptions, 1);
  } finally { setExamActive(false); }
});
