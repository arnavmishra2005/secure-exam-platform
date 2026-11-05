// Runs the student's code (Python, C, C++, Java) on this PC for "Run" / "Run samples".
// Contract: docs/local-code-runner.md (types LocalRunJob / ExecutionOutcome in
// @secure-exam/types). The student's code is untrusted, so on Linux it runs in
// a bubblewrap sandbox: no network, read-only system, private empty /tmp, a
// scrubbed environment, a memory cap, and a hard deadline.
//
// #19 (Person B, merge with C): every run also gets
//  - its own cgroup (`systemd-run --user --scope`): at most 64 processes (fork
//    bombs), a memory cap that also counts /tmp, one CPU;
//  - a system-call filter (seccompFilter.ts, passed to `bwrap --seccomp`);
//  - a size cap on /tmp where bubblewrap supports it (0.10+).
// bwrap, prlimit, systemd-run and the filter are all required; a self-test
// (checkSandbox) proves they work before the first run. If they don't, runs
// are refused and the exam view tells the student to call the invigilator.
//
// #16 (Person B, merge with C): C, C++ and Java compile once per Run inside
// the same sandbox (job folder writable at /work), then each input runs the
// result read-only (/sandbox). Compilers come from the lab image
// (gcc, g++, a JDK; infra/linux-kiosk/setup-exam-kiosk.sh). Flags, time
// factors and memory overheads match the server (api execution/language.registry.ts).

import { spawn, spawnSync, type ChildProcess } from 'child_process';
import type { Writable } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildSeccompFilter, seccompArch } from './seccompFilter';

export type LocalLanguage = 'python' | 'c' | 'cpp' | 'java';
const LANGUAGES: readonly LocalLanguage[] = ['python', 'c', 'cpp', 'java'];

export interface LocalRunJob {
  language: LocalLanguage;
  code: string;
  inputs: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitBytes: number;
}

export type ExecutionStatus =
  | 'OK'
  | 'COMPILATION_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export interface ExecutionOutcome {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number;
}

export interface RunnerOptions {
  /** Development only: run python3 directly when bubblewrap is unavailable. NOT a sandbox. */
  allowUnsandboxed?: boolean;
}

const CODE_MAX_LENGTH = 10_000;
const MAX_INPUTS = 50;
const MAX_INPUT_BYTES = 100_000;
const SANDBOX_ENV = ['--clearenv', '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'HOME', '/tmp', '--setenv', 'LANG', 'C.UTF-8'];

function which(binary: string): string | null {
  const found = spawnSync('which', [binary], { encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim() : null;
}

function findPython(): string | null {
  return which('python3.12') ?? which('python3');
}

function validate(job: LocalRunJob): void {
  const bad =
    !LANGUAGES.includes(job?.language) ||
    typeof job.code !== 'string' ||
    job.code.length > CODE_MAX_LENGTH ||
    !Array.isArray(job.inputs) ||
    job.inputs.length === 0 ||
    job.inputs.length > MAX_INPUTS ||
    job.inputs.some((i) => typeof i !== 'string' || Buffer.byteLength(i) > MAX_INPUT_BYTES) ||
    !(job.timeLimitMs >= 100 && job.timeLimitMs <= 10_000) ||
    !(job.memoryLimitMb >= 32 && job.memoryLimitMb <= 512) ||
    !(job.outputLimitBytes >= 1_024 && job.outputLimitBytes <= 1_048_576);
  if (bad) throw new Error('Invalid code run request.');
}

/** Processes (and threads) one run may have: stops fork bombs before they slow the PC. */
const TASKS_MAX = 64;
/** Memory on top of the student's budget: Python start-up and the private /tmp (which the cgroup counts). */
const MEMORY_OVERHEAD_MB = 64;
const TMP_SIZE_BYTES = 16 * 1024 * 1024;
/** The fd bubblewrap reads the seccomp filter from (stdio index 3 of the spawned process). */
const SECCOMP_FD = 3;

/** The tools a sandboxed run needs, found once. */
interface SandboxTools {
  python: string;
  bwrap: string;
  prlimit: string;
  systemdRun: string;
  /** bubblewrap 0.10+ can cap the size of a tmpfs. */
  tmpfsSize: boolean;
  filter: Buffer;
  /** Read-only paths outside /usr some languages need (the JDK's /etc/java-* configuration). */
  extraReadOnly: string[];
}

type Runner = { sandboxed: true; tools: SandboxTools } | { sandboxed: false; python: string };

/** A shell-free command line, plus the seccomp filter to feed on fd 3 (sandboxed runs only). */
interface Command {
  cmd: string;
  args: string[];
  filter?: Buffer;
}

/** "bubblewrap 0.9.0" → true when at least 0.10. */
export function bwrapSupportsTmpfsSize(versionOutput: string): boolean {
  const m = /(\d+)\.(\d+)/.exec(versionOutput);
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > 0 || minor >= 10;
}

/** Finds the sandbox tools. Throws with a message for the invigilator when one is missing. */
function findTools(python: string): SandboxTools {
  if (process.platform !== 'linux') throw new Error('Code can only be run locally on Linux lab computers.');
  const missing = (what: string) => new Error(`Cannot run code on this computer: ${what} is not installed.`);
  const bwrap = which('bwrap');
  if (!bwrap) throw missing('the sandbox (bubblewrap)');
  const prlimit = which('prlimit');
  if (!prlimit) throw missing('prlimit (util-linux)');
  const systemdRun = which('systemd-run');
  if (!systemdRun) throw missing('systemd-run');
  const arch = seccompArch();
  if (!arch) throw new Error(`Cannot run code on this computer: no system-call filter for ${process.arch}.`);
  const version = spawnSync(bwrap, ['--version'], { encoding: 'utf8' }).stdout ?? '';
  // Ubuntu's OpenJDK keeps its configuration (security policy, ...) in /etc/java-<version>.
  const extraReadOnly = fs.existsSync('/etc')
    ? fs.readdirSync('/etc').filter((name) => name.startsWith('java-')).map((name) => `/etc/${name}`)
    : [];
  return {
    python,
    bwrap,
    prlimit,
    systemdRun,
    tmpfsSize: bwrapSupportsTmpfsSize(version),
    filter: buildSeccompFilter(arch),
    extraReadOnly,
  };
}

/** The cgroup wrapper: limits that hold for the whole process tree, /tmp included. */
function scopeArgs(tools: SandboxTools, memoryMb: number, tasksMax = TASKS_MAX): string[] {
  return [
    tools.systemdRun, '--user', '--scope', '--quiet', '--collect',
    '-p', `TasksMax=${tasksMax}`,
    '-p', `MemoryMax=${memoryMb}M`,
    '-p', 'MemorySwapMax=0',
    '-p', 'CPUQuota=100%',
    '--',
  ];
}

/** One sandboxed program: what it sees, what it runs, and its limits. */
export interface SandboxSpec {
  /** Extra bwrap mounts, e.g. ['--ro-bind', dir, '/sandbox']. */
  mounts: string[];
  /** The program and its arguments, as seen inside the sandbox. */
  argv: string[];
  /** cgroup MemoryMax (MB), the program's own overheads included. */
  memoryMb: number;
  tasksMax?: number;
  /** prlimit --as (MB); null for the JVM, which reserves far more address space than it uses. */
  addressSpaceMb: number | null;
  stackMb?: number;
  fileSizeBytes?: number;
}

/** The full command line for one sandboxed program. */
export function sandboxedCommand(tools: SandboxTools, spec: SandboxSpec): Command {
  const limits = [
    tools.prlimit,
    ...(spec.addressSpaceMb !== null ? [`--as=${spec.addressSpaceMb * 1024 * 1024}`] : []),
    '--nofile=64',
    `--fsize=${spec.fileSizeBytes ?? TMP_SIZE_BYTES}`,
    ...(spec.stackMb ? [`--stack=${spec.stackMb * 1024 * 1024}`] : []),
    '--',
  ];
  const sandbox = [
    tools.bwrap, '--unshare-all', '--die-with-parent', '--new-session',
    '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib', '--ro-bind-try', '/lib64', '/lib64', '--ro-bind', '/bin', '/bin',
    ...tools.extraReadOnly.flatMap((p) => ['--ro-bind-try', p, p]),
    '--proc', '/proc', '--dev', '/dev',
    ...(tools.tmpfsSize ? ['--size', String(TMP_SIZE_BYTES)] : []), '--tmpfs', '/tmp',
    ...spec.mounts,
    '--chdir', '/tmp', ...SANDBOX_ENV,
    '--seccomp', String(SECCOMP_FD),
    ...spec.argv,
  ];
  const [cmd, ...args] = [...scopeArgs(tools, spec.memoryMb, spec.tasksMax ?? TASKS_MAX), ...limits, ...sandbox];
  return { cmd, args, filter: tools.filter };
}

/** The full command line for one sandboxed Python run of `scriptPath`. */
export function sandboxCommand(tools: SandboxTools, scriptPath: string, memoryLimitMb: number, programArgs: string[] = []): Command {
  // Python reserves some address space at start-up, so give the limit headroom over the student's budget.
  return sandboxedCommand(tools, {
    mounts: ['--ro-bind', scriptPath, '/sandbox/main.py'],
    argv: [tools.python, '-I', '-B', '/sandbox/main.py', ...programArgs],
    memoryMb: memoryLimitMb + MEMORY_OVERHEAD_MB,
    addressSpaceMb: memoryLimitMb + MEMORY_OVERHEAD_MB,
  });
}

// ---------------------------------------------------------------------------
// Languages (#16)
// ---------------------------------------------------------------------------

/** How one language compiles and runs here. `work`/`run` are the job folder's paths as the program sees them. */
interface LanguagePlan {
  sourceName: string;
  compile?: { spec: SandboxSpec; timeLimitMs: number };
  run: SandboxSpec;
  /** Multiplier on the time limit (Java's start-up), as on the server. */
  timeFactor: number;
}

const COMPILE_MEMORY_MB = 512;
const JVM_FLAGS = ['-XX:+UseSerialGC', '-XX:ActiveProcessorCount=1', '-XX:-UsePerfData', '-Xshare:auto'];

/** The compilers a language needs, by role. */
type Compilers = Record<'cc' | 'javac' | 'java', string | undefined>;

export function languagePlan(
  language: LocalLanguage,
  tools: Pick<SandboxTools, 'python'> & Partial<Compilers>,
  paths: { work: string; run: string; hostDir: string },
  memoryLimitMb: number,
  sandboxed = true,
): LanguagePlan {
  const rw = sandboxed ? ['--bind', paths.hostDir, paths.work] : [];
  const ro = sandboxed ? ['--ro-bind', paths.hostDir, paths.run] : [];
  switch (language) {
    case 'python':
      return {
        sourceName: 'main.py',
        run: {
          mounts: ro,
          argv: [tools.python, '-I', '-B', `${paths.run}/main.py`],
          memoryMb: memoryLimitMb + MEMORY_OVERHEAD_MB,
          addressSpaceMb: memoryLimitMb + MEMORY_OVERHEAD_MB,
        },
        timeFactor: 1,
      };
    case 'c':
    case 'cpp': {
      const source = language === 'c' ? 'main.c' : 'main.cpp';
      const std = language === 'c' ? '-std=gnu17' : '-std=gnu++17';
      return {
        sourceName: source,
        compile: {
          spec: {
            mounts: rw,
            argv: [tools.cc!, std, '-O2', '-pipe', '-fmax-errors=5', '-o', `${paths.work}/main`, `${paths.work}/${source}`, '-lm'],
            memoryMb: COMPILE_MEMORY_MB,
            addressSpaceMb: null,
            fileSizeBytes: 64 * 1024 * 1024,
          },
          timeLimitMs: 10_000,
        },
        run: { mounts: ro, argv: [`${paths.run}/main`], memoryMb: memoryLimitMb + MEMORY_OVERHEAD_MB, addressSpaceMb: memoryLimitMb + MEMORY_OVERHEAD_MB, stackMb: 64 },
        timeFactor: 1,
      };
    }
    case 'java':
      return {
        sourceName: 'Main.java',
        compile: {
          spec: {
            mounts: rw,
            argv: [
              tools.javac!, '-J-Xmx256m', ...JVM_FLAGS.map((f) => `-J${f}`), '-J-XX:TieredStopAtLevel=1',
              '-encoding', 'UTF-8', '-Xmaxerrs', '5', '-d', paths.work, `${paths.work}/Main.java`,
            ],
            memoryMb: COMPILE_MEMORY_MB + 128,
            tasksMax: 128,
            addressSpaceMb: null,
          },
          timeLimitMs: 15_000,
        },
        run: {
          mounts: ro,
          argv: [tools.java!, `-Xmx${memoryLimitMb}m`, '-Xss64m', ...JVM_FLAGS, '-cp', paths.run, 'Main'],
          memoryMb: memoryLimitMb + 320,
          tasksMax: 128,
          addressSpaceMb: null,
        },
        timeFactor: 2,
      };
  }
}

const COMPILER_NAMES: Record<Exclude<LocalLanguage, 'python'>, string> = { c: 'gcc', cpp: 'g++', java: 'a Java JDK (javac)' };

/** The compiler binaries for a language (real paths, so they resolve inside the sandbox's /usr). */
function findCompilers(language: LocalLanguage): Partial<Compilers> {
  const real = (bin: string | null) => (bin ? fs.realpathSync(bin) : undefined);
  if (language === 'python') return {};
  const found: Partial<Compilers> =
    language === 'java' ? { javac: real(which('javac')), java: real(which('java')) } : { cc: real(which(language === 'c' ? 'gcc' : 'g++')) };
  if (Object.values(found).some((v) => !v)) {
    throw new Error(`Cannot run ${language === 'cpp' ? 'C++' : language === 'c' ? 'C' : 'Java'} code on this computer: ${COMPILER_NAMES[language]} is not installed.`);
  }
  return found;
}

/**
 * systemd-run reaches the user's service manager over D-Bus, so it needs
 * these two variables; bwrap --clearenv keeps them from the student's program.
 */
function wrapperEnv(): Record<string, string> {
  const env: Record<string, string> = { PATH: '/usr/bin:/bin', HOME: '/tmp', LANG: 'C.UTF-8' };
  for (const key of ['XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS']) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

// ---------------------------------------------------------------------------
// Self-test: prove the sandbox works on this PC before the first run.
// ---------------------------------------------------------------------------

export interface SandboxStatus {
  ok: boolean;
  /** Why it doesn't work, for the invigilator. */
  reason?: string;
}

const SELF_TEST_SCRIPT = [
  'import ctypes, sys',
  'if sys.argv[1] == "hello":',
  '    print(6 * 7)',
  'else:',
  '    ctypes.CDLL(None).ptrace(0, 0, 0, 0)',
  '    print("ptrace was not blocked")',
].join('\n');
/** bwrap reports a program killed by a signal as 128 + signal; SIGSYS is 31. */
const EXIT_SIGSYS = 128 + 31;

let ready: Promise<Runner> | null = null;

/** Finds the tools and runs the self-test once; a failure is retried on the next call. */
function prepare(options: RunnerOptions): Promise<Runner> {
  ready ??= (async (): Promise<Runner> => {
    const python = findPython();
    if (!python) throw new Error('Python 3 is not installed on this computer.');
    try {
      const tools = findTools(python);
      await selfTest(tools);
      return { sandboxed: true, tools };
    } catch (err) {
      // Development only (IS_DEV && EXAM_UNSANDBOXED_RUNNER=1): run without a sandbox.
      if (options.allowUnsandboxed) return { sandboxed: false, python };
      throw err;
    }
  })();
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

async function selfTest(tools: SandboxTools): Promise<void> {
  const fail = (what: string) => new Error(`The code sandbox does not work on this computer (${what}). Tell the invigilator.`);

  // 1. The cgroup limits really apply (the user's systemd delegates pids and memory).
  const probe = spawnSync(
    scopeArgs(tools, 128)[0],
    [...scopeArgs(tools, 128).slice(1), '/bin/sh', '-c', 'd=/sys/fs/cgroup$(sed -n "s/^0:://p" /proc/self/cgroup); cat "$d/pids.max" "$d/memory.max"'],
    { encoding: 'utf8', env: wrapperEnv(), timeout: 10_000 },
  );
  const [pids, memory] = (probe.stdout ?? '').trim().split('\n');
  if (probe.status !== 0 || pids !== String(TASKS_MAX) || memory !== String(128 * 1024 * 1024)) {
    throw fail(`process and memory limits: ${(probe.stderr || probe.stdout || String(probe.error ?? '')).trim().slice(0, 200)}`);
  }

  // 2. A program runs, and 3. the system-call filter is in place.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-selftest-'));
  try {
    const script = path.join(dir, 'main.py');
    fs.writeFileSync(script, SELF_TEST_SCRIPT, { mode: 0o444 });
    const job = { timeLimitMs: 5000, outputLimitBytes: 1024 };
    const hello = await runOnce(sandboxCommand(tools, script, 64, ['hello']), '', job);
    if (hello.status !== 'OK' || hello.stdout !== '42\n') throw fail(`test run: ${hello.status} ${hello.stderr.trim().slice(0, 200)}`);
    const blocked = await runOnce(sandboxCommand(tools, script, 64, ['ptrace']), '', job);
    if (blocked.exitCode !== EXIT_SIGSYS) throw fail(`system-call filter not applied: exit ${blocked.exitCode}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs the self-test (once) so the app can warn at start-up instead of at the first Run. */
export async function checkSandbox(options: RunnerOptions = {}): Promise<SandboxStatus> {
  try {
    await prepare(options);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

function runOnce(
  command: Command,
  input: string,
  job: Pick<LocalRunJob, 'timeLimitMs' | 'outputLimitBytes'>,
): Promise<ExecutionOutcome> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child: ChildProcess & { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream; stdin: Writable } = spawn(
      command.cmd,
      command.args,
      {
        detached: true, // own process group, so the whole tree can be killed
        // fd 3 carries the seccomp filter to bwrap (`--seccomp 3`).
        stdio: command.filter ? ['pipe', 'pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
        env: command.filter ? wrapperEnv() : { PATH: '/usr/bin:/bin', HOME: '/tmp', LANG: 'C.UTF-8' },
      },
    ) as never;
    if (command.filter) {
      const filterPipe = child.stdio[SECCOMP_FD] as Writable;
      filterPipe.on('error', () => undefined); // bwrap failed before reading it; reported through its exit
      filterPipe.end(command.filter);
    }

    let stdout = '';
    let stderr = '';
    let killedFor: 'time' | 'output' | null = null;
    let settled = false;

    const killTree = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      killedFor ??= 'time';
      killTree();
    }, job.timeLimitMs);

    const collect = (which: 'out' | 'err') => (chunk: Buffer) => {
      const current = which === 'out' ? stdout : stderr;
      const room = job.outputLimitBytes - Buffer.byteLength(current);
      const text = chunk.toString('utf8');
      const kept = Buffer.byteLength(text) <= room ? text : Buffer.from(text).subarray(0, Math.max(room, 0)).toString('utf8');
      if (which === 'out') stdout += kept;
      else stderr += kept;
      if (Buffer.byteLength(text) > room) {
        killedFor ??= 'output';
        killTree();
      }
    };
    child.stdout.on('data', collect('out'));
    child.stderr.on('data', collect('err'));
    child.stdin.on('error', () => undefined); // the program may exit without reading its input
    child.stdin.end(input);

    const finish = (outcome: Omit<ExecutionOutcome, 'timeMs'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killTree(); // nothing the program started may outlive the run
      resolve({ ...outcome, timeMs: Date.now() - started });
    };

    child.on('error', (err) => finish({ status: 'INTERNAL_ERROR', stdout, stderr: err.message, exitCode: null }));
    // Finish on 'exit', not 'close': a program that leaves a background process
    // holding the output pipes open would otherwise keep us waiting. A short
    // pause lets the last buffered output arrive; finish() then kills the group.
    child.on('exit', (code, signal) => {
      setTimeout(() => {
        if (killedFor === 'time') return finish({ status: 'TIME_LIMIT_EXCEEDED', stdout, stderr, exitCode: code });
        if (killedFor === 'output') return finish({ status: 'OUTPUT_LIMIT_EXCEEDED', stdout, stderr, exitCode: code });
        // SIGKILL we didn't send: the memory cap. Through bwrap it shows as exit 128 + 9.
        if (signal === 'SIGKILL' || code === 137 || /MemoryError|java\.lang\.OutOfMemoryError|std::bad_alloc/.test(stderr)) {
          return finish({ status: 'MEMORY_LIMIT_EXCEEDED', stdout, stderr, exitCode: code });
        }
        finish({ status: code === 0 ? 'OK' : 'RUNTIME_ERROR', stdout, stderr, exitCode: code });
      }, 30);
    });
  });
}

/** The outcome every input gets when the program doesn't compile. */
function compileFailure(outcome: ExecutionOutcome, timeLimitMs: number): ExecutionOutcome {
  const base = { status: 'COMPILATION_ERROR' as const, stdout: '', exitCode: outcome.exitCode, timeMs: 0 };
  if (outcome.status === 'TIME_LIMIT_EXCEEDED') {
    return { ...base, stderr: `Compilation took longer than ${Math.round(timeLimitMs / 1000)} seconds.` };
  }
  if (outcome.status === 'MEMORY_LIMIT_EXCEEDED') return { ...base, stderr: 'Compilation ran out of memory.' };
  // Compilers write errors to stderr (gcc) or stdout and stderr (javac).
  return { ...base, stderr: [outcome.stdout, outcome.stderr].filter(Boolean).join('\n') };
}

/** One outcome per input, in order. Rejects only when the runner itself cannot work. */
export async function runCode(job: LocalRunJob, options: RunnerOptions = {}): Promise<ExecutionOutcome[]> {
  validate(job);
  const runner = await prepare(options);
  if (!runner.sandboxed && job.language !== 'python') {
    // Development without a sandbox (macOS): its gcc is clang and its JDK may be missing, so the
    // server runs C, C++ and Java instead (the exam view falls back when CODING_SERVER_RUN allows it).
    throw new Error('C, C++ and Java run only in the sandbox on a Linux lab computer.');
  }
  const compilers = findCompilers(job.language);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-run-'));
  try {
    const sandboxed = runner.sandboxed;
    const paths = sandboxed ? { work: '/work', run: '/sandbox', hostDir: dir } : { work: dir, run: dir, hostDir: dir };
    const plan = languagePlan(job.language, { python: sandboxed ? runner.tools.python : runner.python, ...compilers }, paths, job.memoryLimitMb, sandboxed);
    fs.writeFileSync(path.join(dir, plan.sourceName), job.code, { mode: 0o444 });
    // Development only (allowUnsandboxed): NOT a sandbox.
    const command = (spec: SandboxSpec): Command =>
      sandboxed ? sandboxedCommand(runner.tools, spec) : { cmd: spec.argv[0], args: spec.argv.slice(1) };

    if (plan.compile) {
      const compiled = await runOnce(command(plan.compile.spec), '', { timeLimitMs: plan.compile.timeLimitMs, outputLimitBytes: job.outputLimitBytes });
      if (compiled.status === 'INTERNAL_ERROR') throw new Error(`The compiler could not start: ${compiled.stderr}`);
      if (compiled.status !== 'OK') return job.inputs.map(() => compileFailure(compiled, plan.compile!.timeLimitMs));
    }

    const limits = { timeLimitMs: Math.round(job.timeLimitMs * plan.timeFactor), outputLimitBytes: job.outputLimitBytes };
    const outcomes: ExecutionOutcome[] = [];
    for (const input of job.inputs) outcomes.push(await runOnce(command(plan.run), input, limits));
    return outcomes;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
