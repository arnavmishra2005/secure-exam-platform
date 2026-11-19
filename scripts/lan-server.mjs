// Runs the platform from this computer for everyone on the same network (e.g. college wifi),
// for demos and testing. Not a production deployment: see infra/intranet for that.
//
//   npm run lan                     detect this computer's network address
//   npm run lan -- --ip 10.1.2.3    use this address (several networks, or a VPN)
//   npm run lan -- --no-build       reuse the last website build
//
// What runs:
//   - the website (built, served by `vite preview`) on every interface, port 3003;
//   - its /api path proxied to the API, which listens on 127.0.0.1:3000 only.
// So everyone uses one address, http://<ip>:3003, in the browser and in the exam app.
// Postgres must already be running (as for `npm run dev`). Docker is needed for grading code.

import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { createConnection } from 'node:net';

const args = process.argv.slice(2);
const ipArg = args.includes('--ip') ? args[args.indexOf('--ip') + 1] : args.find((a) => a.startsWith('--ip='))?.slice(5);
const build = !args.includes('--no-build');
const WEB_PORT = 3003;
const API_PORT = 3000;

function fail(message) {
  console.error(`\nlan: ${message}`);
  process.exit(1);
}

/** The first private IPv4 address of a real interface (wifi or ethernet). */
function lanAddress() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^(lo|docker|br-|veth|utun|awdl|llw|bridge|vmnet|vboxnet)/.test(name)) continue;
      candidates.push({ name, address: a.address });
    }
  }
  const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  candidates.sort((x, y) => Number(isPrivate(y.address)) - Number(isPrivate(x.address)));
  return candidates;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.status !== 0) fail(`${label} failed.`);
}

const found = lanAddress();
const ip = ipArg ?? found[0]?.address;
if (!ip) fail('no network address found. Connect to the wifi first, or pass one: npm run lan -- --ip <address>');
if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) fail(`not an IPv4 address: ${ip}`);

for (const [port, what] of [[API_PORT, 'the API'], [WEB_PORT, 'the website']]) {
  if (await portInUse(port)) fail(`port ${port} is busy. Stop ${what} you already run (npm run dev / api:start / web:dev) first.`);
}

console.log('🔧 Building the shared packages…');
run('npm', ['run', 'typecheck', '--silent'], 'npm run typecheck');
if (build) {
  console.log('🔧 Building the website…');
  run('npm', ['run', 'web:build', '--silent'], 'npm run web:build');
}

const server = `http://${ip}:${WEB_PORT}`;
const others = found.filter((c) => c.address !== ip).map((c) => `${c.address} (${c.name})`);
console.log(`
──────────────────────────────────────────────────────────────────────
  Secure Exam is starting on this computer for the local network.

  Everyone (browser):     ${server}
  Teammates' exam app, once in their own checkout:
      npm run exam:register -- --server ${server}
  Check from another device:  ${server}/api/health
${others.length ? `\n  Other addresses of this computer: ${others.join(', ')}\n` : ''}
  Keep this window open and the laptop awake and on power. Ctrl+C stops everything.
──────────────────────────────────────────────────────────────────────
`);

// The API listens only on this machine; it trusts exactly one proxy (the website's /api).
const env = { ...process.env, HOST: '127.0.0.1', PORT: String(API_PORT), TRUST_PROXY_HOPS: '1' };
const children = [
  spawn('npm', ['run', 'start', '--workspace=apps/api'], { stdio: 'inherit', env }),
  spawn('npm', ['run', 'preview', '--workspace=@secure-exam/web', '--', '--host', '0.0.0.0', '--port', String(WEB_PORT), '--strictPort'], {
    stdio: 'inherit',
    env,
  }),
];
// macOS: don't let the laptop sleep while serving.
if (process.platform === 'darwin') {
  spawn('caffeinate', ['-dims', '-w', String(process.pid)], { stdio: 'ignore' }).unref();
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
