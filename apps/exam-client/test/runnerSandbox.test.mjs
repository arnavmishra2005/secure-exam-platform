// Run with: npm test --workspace=@secure-exam/exam-client-desktop
// #19: the lab-PC sandbox's command line and system-call filter. The real
// sandbox (systemd-run + bwrap) is checked on Ubuntu by checkSandbox() at start-up.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DENIED as SERVER_DENIED } from '../../../infra/runner/build-seccomp.mjs';
import { bwrapSupportsTmpfsSize, languagePlan, sandboxCommand, sandboxedCommand } from '../dist/main/runner/localRunner.js';
import { buildSeccompFilter, DENIED, seccompArch } from '../dist/main/runner/seccompFilter.js';

const tools = (tmpfsSize = false) => ({
  python: '/usr/bin/python3',
  bwrap: '/usr/bin/bwrap',
  prlimit: '/usr/bin/prlimit',
  systemdRun: '/usr/bin/systemd-run',
  tmpfsSize,
  filter: Buffer.alloc(8),
  extraReadOnly: ['/etc/java-21-openjdk'],
});

test('denies the same system calls as the server sandbox', () => {
  assert.deepEqual([...DENIED].sort(), [...SERVER_DENIED].sort());
});

test('builds a well-formed filter for x64 and arm64 that checks the architecture first', () => {
  for (const [arch, audit] of [['x64', 0xc000003e], ['arm64', 0xc00000b7]]) {
    const bpf = buildSeccompFilter(arch);
    assert.equal(bpf.length % 8, 0);
    assert.ok(bpf.length / 8 < 256);
    assert.equal(bpf.readUInt16LE(0), 0x20); // load arch
    assert.equal(bpf.readUInt32LE(4), 4);
    assert.equal(bpf.readUInt32LE(12), audit); // jeq AUDIT_ARCH
    assert.equal(bpf.readUInt32LE(bpf.length - 4 * 8 + 4), 0x7fff0000); // allow
    assert.equal(bpf.readUInt32LE(bpf.length - 3 * 8 + 4), 0x80000000); // kill process
  }
  assert.equal(seccompArch('ia32'), null);
});

test('wraps every run in a cgroup scope, resource limits, bwrap and the filter, in that order', () => {
  const { cmd, args, filter } = sandboxCommand(tools(), '/tmp/x/main.py', 128);
  const all = [cmd, ...args];
  assert.equal(cmd, '/usr/bin/systemd-run');
  assert.ok(all.includes('TasksMax=64'));
  assert.ok(all.includes('MemoryMax=192M'));
  assert.ok(all.includes('MemorySwapMax=0'));
  const order = ['/usr/bin/systemd-run', '/usr/bin/prlimit', '/usr/bin/bwrap', '--seccomp', '/usr/bin/python3'].map((x) => all.indexOf(x));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal(all[all.indexOf('--seccomp') + 1], '3');
  assert.ok(all.includes('--unshare-all'));
  assert.ok(filter);
  assert.ok(!all.includes('--size'));
});

test('caps /tmp only where bubblewrap supports it', () => {
  const all = sandboxCommand(tools(true), '/tmp/x/main.py', 128).args;
  assert.equal(all[all.indexOf('--size') + 1], String(16 * 1024 * 1024));
  assert.equal(all[all.indexOf('--size') + 2], '--tmpfs');
  assert.equal(bwrapSupportsTmpfsSize('bubblewrap 0.9.0'), false);
  assert.equal(bwrapSupportsTmpfsSize('bubblewrap 0.10.0'), true);
  assert.equal(bwrapSupportsTmpfsSize('bubblewrap 1.0'), true);
  assert.equal(bwrapSupportsTmpfsSize(''), false);
});

// #16: C, C++ and Java on the lab PC.
const paths = { work: '/work', run: '/sandbox', hostDir: '/tmp/exam-run-x' };
const bins = { python: '/usr/bin/python3', cc: '/usr/bin/x86_64-linux-gnu-g++-13', javac: '/usr/lib/jvm/jdk/bin/javac', java: '/usr/lib/jvm/jdk/bin/java' };

test('C and C++ compile once into the writable job folder, then run read-only with a 64 MB stack', () => {
  const plan = languagePlan('cpp', bins, paths, 128);
  assert.equal(plan.sourceName, 'main.cpp');
  assert.deepEqual(plan.compile.spec.mounts, ['--bind', '/tmp/exam-run-x', '/work']);
  assert.ok(plan.compile.spec.argv.includes('-std=gnu++17'));
  assert.ok(plan.compile.spec.argv.includes('-fmax-errors=5'));
  assert.deepEqual(plan.run.mounts, ['--ro-bind', '/tmp/exam-run-x', '/sandbox']);
  assert.deepEqual(plan.run.argv, ['/sandbox/main']);
  const run = [sandboxedCommand(tools(), plan.run).cmd, ...sandboxedCommand(tools(), plan.run).args];
  assert.ok(run.includes(`--stack=${64 * 1024 * 1024}`));
  assert.ok(run.includes(`--as=${192 * 1024 * 1024}`));
  assert.equal(languagePlan('c', bins, paths, 128).compile.spec.argv[1], '-std=gnu17');
});

test('Java gets its heap limit, more threads, twice the time and no address-space cap', () => {
  const plan = languagePlan('java', bins, paths, 256);
  assert.equal(plan.sourceName, 'Main.java');
  assert.equal(plan.timeFactor, 2);
  assert.ok(plan.run.argv.includes('-Xmx256m'));
  assert.equal(plan.run.argv.at(-1), 'Main');
  const run = [sandboxedCommand(tools(), plan.run).cmd, ...sandboxedCommand(tools(), plan.run).args];
  assert.ok(run.includes('TasksMax=128'));
  assert.ok(run.includes('MemoryMax=576M'));
  assert.ok(!run.some((a) => a.startsWith('--as=')));
  // Ubuntu's JDK reads its configuration from /etc/java-*.
  assert.equal(run[run.indexOf('/etc/java-21-openjdk') - 1], '--ro-bind-try');
});

test('Python runs the job folder read-only, as before', () => {
  const plan = languagePlan('python', bins, paths, 128);
  assert.equal(plan.compile, undefined);
  assert.deepEqual(plan.run.argv, ['/usr/bin/python3', '-I', '-B', '/sandbox/main.py']);
});
