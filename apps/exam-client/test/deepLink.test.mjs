import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deepLinkFromArgv, pathForDeepLink } from '../dist/main/deepLink.js';

const ID = '11111111-1111-4111-8111-111111111111';

test('a valid exam link maps to the in-app instructions page', () => {
  assert.equal(pathForDeepLink(`secure-exam://exam/${ID}`), `/student/exams/${ID}`);
  assert.equal(pathForDeepLink(`secure-exam://exam/${ID}/`), `/student/exams/${ID}`);
  assert.equal(pathForDeepLink(`secure-exam://exam/${ID.toUpperCase()}`), `/student/exams/${ID}`);
});

test('anything else is rejected', () => {
  for (const bad of [
    'secure-exam://exam/not-a-uuid',
    'secure-exam://exam/',
    'secure-exam://admin/' + ID,
    'secure-exam://exam/../../admin/exams',
    `secure-exam://exam/${ID}/../x`,
    `https://exam/${ID}`,
    `secure-exam://evil.com/${ID}`,
    'javascript:alert(1)',
    'not a url',
    '',
  ]) {
    assert.equal(pathForDeepLink(bad), null, bad);
  }
});

test('finds the link among command-line arguments', () => {
  assert.equal(deepLinkFromArgv(['electron', '.', `secure-exam://exam/${ID}`]), `secure-exam://exam/${ID}`);
  assert.equal(deepLinkFromArgv(['electron', '.']), null);
});
