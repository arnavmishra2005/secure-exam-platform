import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { electronArguments, electronEnvironment, electronSpawnOptions } from '../scripts/start-electron.mjs';
import { registerWindowsProtocol, windowsProtocolCommands } from '../../../scripts/windows-exam-protocol.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const windowsLauncher = readFileSync(join(testDir, '..', 'scripts', 'start-electron-windows.vbs'), 'utf8');
const protocolKey = 'HKCU\\Software\\Classes\\secure-exam';
const commandKey = `${protocolKey}\\shell\\open\\command`;
const backupKey = 'HKCU\\Software\\SecureExamPlatform\\ExamClientDevProtocolBackup';
const previousKey = `${backupKey}\\PreviousProtocol`;
const commands = windowsProtocolCommands({
  scriptHost: 'C:\\Windows\\System32\\wscript.exe',
  nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
  launcherScript: 'C:\\Users\\arnav\\Desktop\\BTP\\secure-exam-platform-windows\\apps\\exam-client\\scripts\\start-electron-windows.vbs',
  obsoleteScript: 'C:\\Users\\arnav\\Desktop\\BTP\\secure-exam-platform-windows\\apps\\exam-client\\scripts\\start-electron.mjs',
});
const oldProjectCommand =
  '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\arnav\\Desktop\\BTP\\secure-exam-platform-windows\\apps\\exam-client\\scripts\\start-electron.mjs" "%1"';

class FakeRegistry {
  keys = new Map();

  keyExists(key) {
    return [...this.keys.keys()].some((candidate) => candidate === key || candidate.startsWith(`${key}\\`));
  }

  readValue(key, name) {
    return this.keys.get(key)?.get(name) ?? null;
  }

  createKey(key) {
    if (!this.keys.has(key)) this.keys.set(key, new Map());
  }

  writeValue(key, name, value) {
    this.createKey(key);
    this.keys.get(key).set(name, value);
  }

  copyKey(source, destination) {
    if (!this.keyExists(source)) throw new Error(`missing source: ${source}`);
    this.deleteKey(destination);
    const entries = [...this.keys.entries()].filter(
      ([key]) => key === source || key.startsWith(`${source}\\`),
    );
    for (const [key, values] of entries) {
      const suffix = key.slice(source.length);
      this.keys.set(`${destination}${suffix}`, new Map(values));
    }
  }

  deleteKey(key) {
    for (const candidate of this.keys.keys()) {
      if (candidate === key || candidate.startsWith(`${key}\\`)) this.keys.delete(candidate);
    }
  }
}

function register(registry, options = {}) {
  return registerWindowsProtocol({
    registry,
    protocolKey,
    commandKey,
    backupKey,
    currentCommand: commands.current,
    obsoleteCommand: commands.obsolete,
    ...options,
  });
}

test('Windows registration quotes space-containing paths and recognizes the obsolete project handler', () => {
  assert.equal(
    commands.current,
    '"C:\\Windows\\System32\\wscript.exe" //B //NoLogo "C:\\Users\\arnav\\Desktop\\BTP\\secure-exam-platform-windows\\apps\\exam-client\\scripts\\start-electron-windows.vbs" "%1"',
  );
  assert.ok(!commands.current.includes('node.exe'));
  assert.notEqual(commands.current, commands.obsolete);
  assert.equal(commands.obsolete, '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\arnav\\Desktop\\BTP\\secure-exam-platform-windows\\apps\\exam-client\\scripts\\start-electron.mjs" "%1"');
  assert.ok(commands.current.includes('start-electron-windows.vbs'));
});

test('replaces the exact old project handler and backs up its full protocol association', () => {
  const registry = new FakeRegistry();
  registry.writeValue(protocolKey, '', 'URL: Secure Exam');
  registry.writeValue(protocolKey, 'URL Protocol', '');
  registry.writeValue(commandKey, '', oldProjectCommand);

  assert.equal(register(registry), 'registered');
  assert.equal(registry.readValue(commandKey, ''), commands.current);
  assert.equal(registry.readValue(`${previousKey}\\shell\\open\\command`, ''), oldProjectCommand);
  assert.equal(registry.readValue(previousKey, ''), 'URL: Secure Exam');
  assert.equal(registry.readValue(previousKey, 'URL Protocol'), '');
  assert.equal(registry.readValue(backupKey, 'HadPrevious'), '1');

  assert.equal(register(registry, { remove: true }), 'removed');
  assert.equal(registry.readValue(commandKey, ''), oldProjectCommand);
  assert.equal(registry.readValue(protocolKey, ''), 'URL: Secure Exam');
  assert.equal(registry.readValue(protocolKey, 'URL Protocol'), '');
  assert.equal(registry.keyExists(backupKey), false);
});

test('removal recognizes the exact obsolete project handler without touching unrelated handlers', () => {
  const registry = new FakeRegistry();
  registry.writeValue(protocolKey, '', 'URL: Secure Exam');
  registry.writeValue(commandKey, '', oldProjectCommand);

  assert.equal(register(registry, { remove: true }), 'removed');
  assert.equal(registry.keyExists(protocolKey), false);

  registry.writeValue(protocolKey, '', 'URL: Secure Exam');
  registry.writeValue(commandKey, '', '"C:\\Other App\\other.exe" "%1"');
  assert.throws(() => register(registry, { remove: true }), /not this project registration/);
  assert.equal(registry.readValue(commandKey, ''), '"C:\\Other App\\other.exe" "%1"');
});

test('does not recognize a different Node executable or a different project script', () => {
  for (const command of [
    '"C:\\Program Files (x86)\\nodejs\\node.exe" "C:\\Users\\arnav\\Desktop\\BTP\\secure-exam-platform-windows\\apps\\exam-client\\scripts\\start-electron.mjs" "%1"',
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\Other App\\start-electron.mjs" "%1"',
  ]) {
    const registry = new FakeRegistry();
    registry.writeValue(protocolKey, 'URL Protocol', '');
    registry.writeValue(commandKey, '', command);
    assert.throws(() => register(registry), /different application/);
    assert.equal(registry.readValue(commandKey, ''), command);
    assert.equal(registry.keyExists(backupKey), false);
  }
});

test('repeated registration preserves the original snapshot without merging stale data', () => {
  const registry = new FakeRegistry();
  registry.writeValue(protocolKey, '', 'URL: Secure Exam');
  registry.writeValue(commandKey, '', commands.obsolete);
  register(registry);
  registry.writeValue(`${previousKey}\\shell\\open\\command`, '', 'stale backup data');

  assert.equal(register(registry), 'already-registered');
  assert.equal(registry.readValue(`${previousKey}\\shell\\open\\command`, ''), 'stale backup data');
});

test('new registration is idempotent and remove deletes only this handler', () => {
  const registry = new FakeRegistry();
  assert.equal(register(registry), 'registered');
  assert.equal(registry.readValue(commandKey, ''), commands.current);
  assert.equal(registry.readValue(backupKey, 'HadPrevious'), '0');
  assert.equal(register(registry), 'already-registered');
  assert.equal(register(registry, { remove: true }), 'removed');
  assert.equal(registry.keyExists(protocolKey), false);
  assert.equal(registry.keyExists(backupKey), false);
});

test('unrelated handlers are preserved during registration and removal', () => {
  const registry = new FakeRegistry();
  registry.writeValue(protocolKey, 'URL Protocol', '');
  registry.writeValue(commandKey, '', '"C:\\Other App\\other.exe" "%1"');

  assert.throws(() => register(registry), /different application/);
  assert.throws(() => register(registry, { remove: true }), /not this project registration/);
  assert.equal(registry.readValue(commandKey, ''), '"C:\\Other App\\other.exe" "%1"');
});

test('launcher forwards the complete URL as one argument and removes Electron-as-Node mode', () => {
  const link = 'secure-exam://launch/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
  assert.deepEqual(electronArguments([link]), ['.', link]);
  assert.deepEqual(electronEnvironment({ PATH: 'path', ELECTRON_RUN_AS_NODE: '1' }), { PATH: 'path' });
  assert.deepEqual(electronSpawnOptions('win32', { PATH: 'path', ELECTRON_RUN_AS_NODE: '1' }, 'C:\\Secure Exam'), {
    cwd: 'C:\\Secure Exam',
    env: { PATH: 'path' },
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  assert.deepEqual(electronSpawnOptions('linux', { PATH: 'path' }, '/secure-exam'), {
    cwd: '/secure-exam',
    env: { PATH: 'path' },
    detached: false,
    stdio: 'inherit',
    windowsHide: false,
  });
});

test('Windows GUI launcher validates and forwards the complete URL without a console host', () => {
  assert.match(commands.current, /wscript\.exe/i);
  assert.match(windowsLauncher, /CreateObject\("WScript\.Shell"\)/);
  assert.match(windowsLauncher, /ELECTRON_RUN_AS_NODE/);
  assert.match(windowsLauncher, /secure-exam:\/\/launch\/\[A-Za-z0-9_-\]\{43\}/);
  assert.match(windowsLauncher, /node_modules\\electron\\dist\\electron\.exe/);
  assert.match(windowsLauncher, /shell\.Run command, 1, False/);
  assert.match(windowsLauncher, /launchUrl/);
});
