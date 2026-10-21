// Development helper: opens the Electron exam app on an exam in one command.
//
// It does what the browser does when a student presses "Start exam in exam app":
// signs the student in, asks the API for a one-time launch token, and starts the
// app with that link, so nothing has to be copied or pasted. The password is used
// only here, to ask for the token; the app itself never receives it.
//
//   npm run exam:app                                  alice, the seeded sample exam
//   npm run exam:app -- bob@secure-exam.dev Student@1234
//   npm run exam:app -- <email> <password> <examId>
//   npm run exam:app -- --print                       only print the link, do not start the app
//
// Needs the API running (npm run dev) with REQUIRE_DESKTOP_CLIENT=true. Development only.

import { spawn, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const printOnly = args.includes('--print');
const [email = 'alice@secure-exam.dev', password = 'Student@1234', examId = '11111111-1111-4111-8111-111111111111'] =
  args.filter((a) => a !== '--print');
const api = process.env.EXAM_API_URL ?? 'http://localhost:3000';

function fail(message) {
  console.error(`\nexam:app: ${message}`);
  process.exit(1);
}

async function post(path, body, token) {
  let res;
  try {
    res = await fetch(`${api}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    fail(`cannot reach the API at ${api}. Start it first with: npm run dev`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`${path} answered ${res.status}: ${[data.message].flat().join(', ') || res.statusText}`);
  return data;
}

const login = await post('/auth/login', { email, password });
const { token } = await post('/auth/exam-launch', { examId }, login.accessToken);
const link = `secure-exam://launch/${token}`;

if (printOnly) {
  console.log(link);
  process.exit(0);
}

console.log(`Opening the exam app for ${email} ...`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const shell = process.platform === 'win32';
const compile = spawnSync(npm, ['run', 'desktop:compile', '--silent'], { stdio: 'inherit', shell });
if (compile.status !== 0) fail('could not compile the exam app (npm run desktop:compile).');

// ELECTRON_RUN_AS_NODE (set by some terminals) would make Electron behave like plain Node.
const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
const app = spawn(npm, ['run', 'desktop:start', '--workspace=@secure-exam/exam-client-desktop'], {
  stdio: 'inherit',
  shell,
  env: {
    ...env,
    EXAM_LAUNCH_LINK: link,
    // No bubblewrap on macOS/Windows; development only, NOT a sandbox.
    ...(process.platform === 'linux' ? {} : { EXAM_UNSANDBOXED_RUNNER: '1' }),
  },
});
app.on('exit', (code) => process.exit(code ?? 0));
