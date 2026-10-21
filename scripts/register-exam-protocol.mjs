// One-time development setup: makes the operating system open the exam app when the browser
// follows a secure-exam://launch/<token> link (what "Start exam in exam app" does).
//
// A packaged/installed app registers that link type itself. When running from source nothing
// is installed, so this script registers a small launcher that starts this checkout's
// Electron app with the link:
//
//   macOS : ~/Applications/SecureExamDev.app  (a tiny AppleScript app that handles the link)
//   Linux : ~/.local/share/applications/secure-exam-dev.desktop  (+ xdg-mime default handler)
//
//   npm run exam:register              register (safe to repeat; also after moving the repo)
//   npm run exam:register -- --remove  undo it
//
// Windows is not supported (see the README).

import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'apps', 'exam-client');
const remove = process.argv.includes('--remove');
const SCHEME = 'secure-exam';

function fail(message) {
  console.error(`\nexam:register: ${message}`);
  process.exit(1);
}

function electronBinary() {
  try {
    const bin = createRequire(join(root, 'package.json'))('electron');
    if (typeof bin === 'string' && existsSync(bin)) return bin;
  } catch {
    // fall through
  }
  return fail('the Electron binary is missing. Run: node node_modules/electron/install.js');
}

function compileApp() {
  const npm = 'npm';
  const result = spawnSync(npm, ['run', 'desktop:compile', '--silent'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) fail('could not compile the exam app (npm run desktop:compile).');
}

// ---------------------------------------------------------------- macOS
function macos() {
  const app = join(homedir(), 'Applications', 'SecureExamDev.app');
  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

  if (remove) {
    if (existsSync(app)) spawnSync(lsregister, ['-u', app]);
    rmSync(app, { recursive: true, force: true });
    console.log('Removed the development secure-exam:// handler.');
    return;
  }

  const electron = electronBinary();
  compileApp();

  // The launcher: the OS hands the clicked link to this handler, which starts the exam app with it.
  // The app is started detached so the launcher can exit; ELECTRON_RUN_AS_NODE must not be set.
  // macOS has no bubblewrap, so student code runs unsandboxed (development only, NOT a sandbox).
  const q = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const script = [
    'on open location theURL',
    `  do shell script "/usr/bin/env -u ELECTRON_RUN_AS_NODE EXAM_UNSANDBOXED_RUNNER=1 " & quoted form of ${q(electron)} & " " & quoted form of ${q(appDir)} & " " & quoted form of theURL & " >/dev/null 2>&1 &"`,
    'end open location',
    // Opening the launcher by hand (double click) does nothing useful.
    'on run',
    'end run',
  ].join('\n');
  const source = join(tmpdir(), 'secure-exam-dev-launcher.applescript');
  writeFileSync(source, script);

  mkdirSync(dirname(app), { recursive: true });
  rmSync(app, { recursive: true, force: true });
  execFileSync('osacompile', ['-o', app, source]);

  const plist = join(app, 'Contents', 'Info.plist');
  const buddy = (cmd) => spawnSync('/usr/libexec/PlistBuddy', ['-c', cmd, plist]);
  buddy('Delete :CFBundleURLTypes');
  buddy('Add :CFBundleURLTypes array');
  buddy('Add :CFBundleURLTypes:0 dict');
  buddy('Add :CFBundleURLTypes:0:CFBundleURLName string Secure Exam (development)');
  buddy('Add :CFBundleURLTypes:0:CFBundleURLSchemes array');
  buddy(`Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${SCHEME}`);
  buddy('Add :LSUIElement bool true'); // no Dock icon, no menu bar
  buddy('Set :CFBundleName SecureExamDev');
  buddy('Add :CFBundleIdentifier string dev.secure-exam.launcher');

  // Editing Info.plist breaks the ad-hoc signature osacompile put on the bundle.
  spawnSync('codesign', ['--force', '--deep', '--sign', '-', app]);
  spawnSync(lsregister, ['-f', app]);

  // Make it THE handler (an earlier Electron run may have claimed the link type for itself).
  const bundleId = 'dev.secure-exam.launcher';
  spawnSync('osascript', [
    '-l', 'JavaScript', '-e',
    `ObjC.import('CoreServices'); $.LSSetDefaultHandlerForURLScheme($('${SCHEME}'), $('${bundleId}'))`,
  ]);

  console.log(`Registered ${app}\nThe browser can now open the exam app with ${SCHEME}:// links.`);
  console.log('The first time, the browser asks "Open SecureExamDev?". Allow it (tick "always allow" if offered).');
}

// ---------------------------------------------------------------- Linux
function linux() {
  const apps = join(homedir(), '.local', 'share', 'applications');
  const desktopFile = join(apps, 'secure-exam-dev.desktop');

  if (remove) {
    rmSync(desktopFile, { force: true });
    spawnSync('update-desktop-database', [apps]);
    console.log('Removed the development secure-exam:// handler.');
    return;
  }

  const electron = electronBinary();
  compileApp();
  mkdirSync(apps, { recursive: true });
  const exec = `env -u ELECTRON_RUN_AS_NODE "${electron}" "${appDir}" %u`;
  writeFileSync(
    desktopFile,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Secure Exam (development)',
      `Exec=${exec}`,
      'Terminal=false',
      'NoDisplay=true',
      `MimeType=x-scheme-handler/${SCHEME};`,
      'Categories=Education;',
      '',
    ].join('\n'),
  );
  spawnSync('update-desktop-database', [apps]);
  const set = spawnSync('xdg-mime', ['default', 'secure-exam-dev.desktop', `x-scheme-handler/${SCHEME}`]);
  if (set.error || set.status !== 0) fail('xdg-mime failed. Install it with: sudo apt install xdg-utils');
  const check = spawnSync('xdg-mime', ['query', 'default', `x-scheme-handler/${SCHEME}`], { encoding: 'utf8' });

  console.log(`Wrote ${desktopFile}\nDefault handler for ${SCHEME}:// is now: ${check.stdout.trim() || '(unknown)'}`);
  console.log('The first time, the browser asks to open "Secure Exam (development)". Allow it.');
}

if (process.platform === 'darwin') macos();
else if (process.platform === 'linux') linux();
else fail(`${process.platform} is not supported. Use macOS or Ubuntu (Windows: use WSL2 and the browser fallback).`);
