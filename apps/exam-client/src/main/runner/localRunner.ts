// Runs the student's Python on this PC for "Run" / "Run samples".
// Contract: docs/local-code-runner.md (types LocalRunJob / ExecutionOutcome in
// @secure-exam/types). The student's code is untrusted, so on Linux it runs in
// a bubblewrap sandbox: no network, read-only system, private empty /tmp, a
// scrubbed environment, a memory cap, and a hard deadline.

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface LocalRunJob {
  language: 'python';
  code: string;
  inputs: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitBytes: number;
}

export type ExecutionStatus =
  | 'OK'
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
    job?.language !== 'python' ||
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

/** The command line for one run. Rejects when the machine cannot sandbox it. */
function buildCommand(python: string, scriptPath: string, job: LocalRunJob, options: RunnerOptions): { cmd: string; args: string[] } {
  const bwrap = process.platform === 'linux' ? which('bwrap') : null;
  if (!bwrap) {
    if (options.allowUnsandboxed) return { cmd: python, args: ['-I', '-B', scriptPath] };
    throw new Error('Cannot run code on this computer: the sandbox (bubblewrap) is not installed.');
  }
  // Python reserves some address space at start-up, so give the limit headroom over the student's budget.
  const addressSpace = String((job.memoryLimitMb + 64) * 1024 * 1024);
  const prlimit = which('prlimit');
  const limits = prlimit ? [prlimit, `--as=${addressSpace}`, `--nofile=64`, `--fsize=${16 * 1024 * 1024}`, '--'] : [];
  const sandbox = [
    bwrap, '--unshare-all', '--die-with-parent', '--new-session',
    '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib', '--ro-bind-try', '/lib64', '/lib64', '--ro-bind', '/bin', '/bin',
    '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
    '--ro-bind', scriptPath, '/sandbox/main.py',
    '--chdir', '/tmp', ...SANDBOX_ENV,
    python, '-I', '-B', '/sandbox/main.py',
  ];
  const [cmd, ...args] = [...limits, ...sandbox];
  return { cmd, args };
}

function runOnce(command: { cmd: string; args: string[] }, input: string, job: LocalRunJob): Promise<ExecutionOutcome> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command.cmd, command.args, {
      detached: true, // own process group, so the whole tree can be killed
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', HOME: '/tmp', LANG: 'C.UTF-8' },
    });

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
        if (signal === 'SIGKILL' || /MemoryError/.test(stderr)) {
          return finish({ status: 'MEMORY_LIMIT_EXCEEDED', stdout, stderr, exitCode: code });
        }
        finish({ status: code === 0 ? 'OK' : 'RUNTIME_ERROR', stdout, stderr, exitCode: code });
      }, 30);
    });
  });
}

/** One outcome per input, in order. Rejects only when the runner itself cannot work. */
export async function runCode(job: LocalRunJob, options: RunnerOptions = {}): Promise<ExecutionOutcome[]> {
  validate(job);
  const python = findPython();
  if (!python) throw new Error('Python 3 is not installed on this computer.');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-run-'));
  try {
    const scriptPath = path.join(dir, 'main.py');
    fs.writeFileSync(scriptPath, job.code, { mode: 0o444 });
    const command = buildCommand(python, scriptPath, job, options);
    const outcomes: ExecutionOutcome[] = [];
    for (const input of job.inputs) outcomes.push(await runOnce(command, input, job));
    return outcomes;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
