import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setExamActive } from '../dist/main/examState.js';
import { drainSecurityEvents } from '../dist/main/securityEvents.js';
import { reportBackInWindow, reportLeftWindow, resetWindowPresence, settleWindow } from '../dist/main/windowPresence.js';

function fakeWindow() {
  const state = { focused: true };
  const win = { isDestroyed: () => false, isFocused: () => state.focused, webContents: { send: () => {} } };
  return { win, state };
}

function types() {
  return drainSecurityEvents().map((e) => `${e.type}:${e.detail}`);
}

test('one departure is one violation, however many window events report it', () => {
  const { win } = fakeWindow();
  setExamActive(true);
  resetWindowPresence();
  drainSecurityEvents();
  try {
    reportLeftWindow(win, 'Switched away from the exam window');
    reportLeftWindow(win, 'Exam window minimized');
    reportLeftWindow(win, 'Exam window hidden');
    reportBackInWindow(win);
    reportBackInWindow(win); // focus without a recorded departure: nothing
    assert.deepEqual(types(), ['FOCUS_LOST:Switched away from the exam window', 'FOCUS_REGAINED:Back in the exam window']);
    reportLeftWindow(win, 'Switched away from the exam window');
    assert.deepEqual(types(), ['FOCUS_LOST:Switched away from the exam window']);
  } finally {
    resetWindowPresence();
    setExamActive(false);
  }
});

test('nothing is recorded while the lockdown moves the window, unless focus is still gone afterwards', async () => {
  const { win, state } = fakeWindow();
  setExamActive(true);
  resetWindowPresence();
  drainSecurityEvents();
  try {
    settleWindow(win, 40);
    reportLeftWindow(win, 'Exam window hidden');
    reportLeftWindow(win, 'Switched away from the exam window');
    assert.deepEqual(types(), []);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.deepEqual(types(), []); // the window had focus when the transition ended

    settleWindow(win, 40);
    state.focused = false;
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.deepEqual(types(), ['FOCUS_LOST:Not in the exam window']);
  } finally {
    resetWindowPresence();
    setExamActive(false);
  }
});

test('nothing is recorded outside an exam', () => {
  const { win } = fakeWindow();
  resetWindowPresence();
  drainSecurityEvents();
  reportLeftWindow(win, 'Switched away from the exam window');
  reportBackInWindow(win);
  assert.deepEqual(types(), []);
});
