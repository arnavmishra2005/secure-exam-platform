import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedAppPath } from '../dist/main/allowedPaths.js';
import { deepLinkFromArgv, isLaunchToken, tokenFromDeepLink } from '../dist/main/deepLink.js';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'; // 43 base64url characters

test('the token fixture is 43 characters', () => assert.equal(TOKEN.length, 43));

test('a valid launch link yields its token', () => {
  assert.equal(tokenFromDeepLink(`secure-exam://launch/${TOKEN}`), TOKEN);
  assert.equal(tokenFromDeepLink(`secure-exam://launch/${TOKEN}/`), TOKEN);
});

test('anything else is rejected', () => {
  for (const bad of [
    'secure-exam://launch/short',
    `secure-exam://launch/${TOKEN}x`,
    `secure-exam://launch/${TOKEN.slice(0, 42)}`,
    'secure-exam://launch/',
    `secure-exam://exam/${TOKEN}`,
    `secure-exam://admin/${TOKEN}`,
    `secure-exam://launch/${TOKEN}/../x`,
    `secure-exam://launch/${'A'.repeat(42)}!`,
    `https://launch/${TOKEN}`,
    'javascript:alert(1)',
    'not a url',
    '',
  ]) {
    assert.equal(tokenFromDeepLink(bad), null, bad);
  }
});

test('isLaunchToken only accepts 43 base64url characters', () => {
  assert.equal(isLaunchToken(TOKEN), true);
  assert.equal(isLaunchToken('a'.repeat(44)), false);
  assert.equal(isLaunchToken(undefined), false);
  assert.equal(isLaunchToken(42), false);
});

test('finds the link among command-line arguments', () => {
  assert.equal(deepLinkFromArgv(['electron', '.', `secure-exam://launch/${TOKEN}`]), `secure-exam://launch/${TOKEN}`);
  assert.equal(deepLinkFromArgv(['electron', '.']), null);
});

test('finds the link in Windows arguments when executable and app paths contain spaces', () => {
  const link = `secure-exam://launch/${TOKEN}`;
  const initialLaunch = [
    'C:\\Program Files\\Secure Exam\\electron.exe',
    'C:\\Users\\Student\\Secure Exam\\apps\\exam-client',
    link,
  ];
  const secondInstance = [
    'C:\\Program Files\\Secure Exam\\electron.exe',
    'C:\\Users\\Student\\Secure Exam\\apps\\exam-client',
    link,
  ];

  assert.equal(deepLinkFromArgv(initialLaunch), link);
  assert.equal(deepLinkFromArgv(secondInstance), link);
});

test('the app can only show the launch, exam and submitted screens', () => {
  for (const ok of ['/launch', '/launch/', '/student/exam', '/student/exam/', '/student/exam/submitted']) {
    assert.equal(isAllowedAppPath(ok), true, ok);
  }
  for (const bad of ['/', '/login', '/student/dashboard', '/student/exams/abc', '/admin/exams', '/student', '/launcher', '/student/exam/other']) {
    assert.equal(isAllowedAppPath(bad), false, bad);
  }
});
