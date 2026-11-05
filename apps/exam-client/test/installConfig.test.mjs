import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readApiBaseUrl } from '../dist/main/installConfig.js';

test('packaged API URL comes from install config and requires HTTPS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exam-config-'));
  const file = join(dir, 'config.json');
  try {
    assert.throws(() => readApiBaseUrl(file), /Set apiBaseUrl/);
    assert.equal(readApiBaseUrl(file, undefined, true), 'http://localhost:3000');
    writeFileSync(file, JSON.stringify({ apiBaseUrl: 'https://exam.college.local/api/' }));
    assert.equal(readApiBaseUrl(file), 'https://exam.college.local/api');
    assert.equal(readApiBaseUrl(file, 'https://override.local/api'), 'https://override.local/api');
    assert.throws(() => readApiBaseUrl(file, 'http://exam.local'), /HTTPS/);
    assert.throws(() => readApiBaseUrl(file, 'https://user:secret@exam.local'), /Invalid/);
    assert.throws(() => readApiBaseUrl(file, 'file:///tmp/api'), /Invalid/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
