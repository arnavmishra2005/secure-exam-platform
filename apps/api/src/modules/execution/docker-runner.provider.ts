/**
 * Owner: Person B.
 *
 * Runs untrusted code in a throw-away Docker container per batch:
 * no network, read-only root filesystem, small noexec /tmp, all capabilities
 * dropped, non-root user, memory/CPU/pid limits, a stricter seccomp filter
 * (infra/runner/seccomp.json) and optionally gVisor (RUNNER_DOCKER_RUNTIME). The student's code and the
 * harness are passed as environment variables (inherited by `docker run -e`,
 * so they never appear in the host's process list) and written to /tmp
 * inside the container, so no host folder is mounted.
 *
 * The API host needs access to a Docker daemon. That access is
 * root-equivalent, so in production the daemon must be a dedicated runner
 * host holding no secrets (see docs/execution-security.md).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import * as path from 'path';
import { classifyOutcome, CodeErrorKind, ExecutionOutcome, ExecutionStatus } from '@secure-exam/types';
import { BatchExecutionJob, ExecutionProvider } from './execution-provider.interface';
import { HARNESS_SOURCE } from './harness';
import { getLanguageSpec, resolveCommand } from './language.registry';
import { RunMonitorService, type RunReport, type SandboxUsage } from './run-monitor.service';

/** Raw per-input result printed by the harness. */
interface HarnessResult {
  exitCode?: number | null;
  timedOut?: boolean;
  timeMs?: number;
  stdout?: string;
  stderr?: string;
  outputExceeded?: boolean;
  spawnError?: string;
}

/** Raw result of the optional compile step. */
interface HarnessCompileResult {
  ok?: boolean;
  exitCode?: number | null;
  timedOut?: boolean;
  output?: string;
  spawnError?: string;
}

/** Extra memory for the harness and /tmp on top of the program's limit. */
const SANDBOX_MEMORY_OVERHEAD_MB = 64;
const TMPFS_SIZE_MB = 16;
const PIDS_LIMIT = 64;

/** Every sandbox container carries these labels (see SandboxReaperService). */
export const RUNNER_LABEL = 'secure-exam-runner';
export const RUNNER_DEADLINE_LABEL = 'secure-exam-runner.deadline';

/** Our stricter seccomp profile; the API runs with apps/api as its working directory. */
export const DEFAULT_SECCOMP_PROFILE = '../../infra/runner/seccomp.json';

/**
 * The seccomp profile to pass to `docker run`, as an absolute path (the
 * Docker CLI reads it and sends it to the daemon, so it works with a remote
 * DOCKER_HOST too). `docker-default` keeps Docker's own profile. A missing
 * file stops the API at start-up rather than running with a weaker filter.
 */
export function resolveSeccompProfile(setting: string | undefined): string | null {
  const value = (setting ?? '').trim() || DEFAULT_SECCOMP_PROFILE;
  if (value === 'docker-default') return null;
  const file = path.resolve(value);
  if (!existsSync(file)) {
    throw new Error(`RUNNER_SECCOMP_PROFILE: ${file} does not exist (generate it with node infra/runner/build-seccomp.mjs)`);
  }
  return file;
}

@Injectable()
export class DockerRunnerProvider implements ExecutionProvider {
  private readonly logger = new Logger(DockerRunnerProvider.name);

  /** Absolute path of the seccomp profile, or null for Docker's default profile. */
  private readonly seccompProfile: string | null;
  /** Docker runtime for the sandbox (e.g. gVisor's `runsc`); empty = Docker's default (runc). */
  private readonly runtime: string;
  /** Refuse languages marked `requiresIsolatedRuntime` without a runtime (default: in production). */
  private readonly requireIsolatedRuntime: boolean;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly monitor?: RunMonitorService,
  ) {
    this.runtime = (this.config.get<string>('RUNNER_DOCKER_RUNTIME') ?? '').trim();
    this.seccompProfile = resolveSeccompProfile(this.config.get<string>('RUNNER_SECCOMP_PROFILE'));
    const required = this.config.get<boolean | string>('RUNNER_REQUIRE_GVISOR_FOR_COMPILED');
    this.requireIsolatedRuntime =
      required === undefined || required === '' ? this.config.get('NODE_ENV') === 'production' : String(required) === 'true';
    if (!this.seccompProfile) {
      this.logger.warn("RUNNER_SECCOMP_PROFILE=docker-default: using Docker's default system-call filter, not the stricter one");
    }
    if (!this.runtime && this.config.get('NODE_ENV') === 'production') {
      this.logger.warn('RUNNER_DOCKER_RUNTIME is not set: sandboxes share the host kernel (no gVisor). See docs/execution-security.md');
    }
  }

  async runBatch(job: BatchExecutionJob): Promise<ExecutionOutcome[]> {
    if (job.inputs.length === 0) return [];
    const started = Date.now();
    const result = await this.execute(job);
    this.monitor?.observe({ job, ...result, runtime: this.runtime, wallMs: Date.now() - started });
    return result.outcomes;
  }

  /** The docker command line for one sandbox (exported for tests through `sandboxArgs`). */
  sandboxArgs(job: BatchExecutionJob, name: string, wallMs: number): string[] {
    const spec = getLanguageSpec(job.language);
    const box = spec.sandbox ?? {};
    const image = this.config.get<string>(spec.imageEnvKey) ?? spec.defaultImage;
    const memoryMb = job.limits.memoryLimitMb + (box.memoryOverheadMb ?? SANDBOX_MEMORY_OVERHEAD_MB);
    const tmpfs = ['rw', 'nosuid', 'nodev', box.tmpfsExec ? 'exec' : 'noexec', `size=${box.tmpfsMb ?? TMPFS_SIZE_MB}m`];
    return [
      'run', '--rm', '-i',
      '--name', name,
      // Labels let the reaper find sandboxes that outlived their deadline (SandboxReaperService).
      '--label', `${RUNNER_LABEL}=1`,
      '--label', `${RUNNER_DEADLINE_LABEL}=${Date.now() + wallMs}`,
      ...(this.runtime ? ['--runtime', this.runtime] : []),
      '--network', 'none',
      '--ipc', 'none',
      '--read-only',
      '--tmpfs', `/tmp:${tmpfs.join(',')}`,
      '--memory', `${memoryMb}m`,
      '--memory-swap', `${memoryMb}m`,
      '--cpus', '1',
      '--pids-limit', String(box.pidsLimit ?? PIDS_LIMIT),
      '--ulimit', 'nofile=64:64',
      ...(box.stackMb ? ['--ulimit', `stack=${box.stackMb * 1048576}:${box.stackMb * 1048576}`] : []),
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      ...(this.seccompProfile ? ['--security-opt', `seccomp=${this.seccompProfile}`] : []),
      '--user', '65534:65534',
      '--log-driver', 'none',
      '-e', 'SRC',
      '-e', 'HARNESS',
      image,
      'sh', '-c',
      `printf '%s' "$SRC" > ${spec.sourcePath} && printf '%s' "$HARNESS" > /tmp/.harness.py` +
        ' && unset SRC HARNESS && exec python3 -I -B /tmp/.harness.py',
    ];
  }

  private async execute(job: BatchExecutionJob): Promise<Omit<RunReport, 'job' | 'runtime' | 'wallMs'>> {
    const spec = getLanguageSpec(job.language);
    const box = spec.sandbox ?? {};
    const unavailable = (why: string) => {
      this.logger.error(why);
      return {
        outcomes: job.inputs.map(() => internalError('Code runner is unavailable. Please try again.')),
        usage: null,
        killedByDeadline: false,
        harnessBroken: false,
      };
    };
    if (box.requiresIsolatedRuntime && !this.runtime && this.requireIsolatedRuntime) {
      return unavailable(
        `${spec.displayName} needs RUNNER_DOCKER_RUNTIME (gVisor) and it is not set; refusing to run ` +
          '(RUNNER_REQUIRE_GVISOR_FOR_COMPILED=false lifts this for development)',
      );
    }

    const dockerBin = this.config.get<string>('RUNNER_DOCKER_BIN') ?? 'docker';
    const outputCapBytes = Number(this.config.get('RUNNER_OUTPUT_LIMIT_BYTES') ?? 65536);
    const startupMs = Number(this.config.get('RUNNER_STARTUP_TIMEOUT_MS') ?? 10000);
    const timeLimitMs = Math.round(job.limits.timeLimitMs * (box.timeFactor ?? 1));

    // Whole-container deadline: every input may use its full time limit,
    // plus a small gap per input and the container start-up time.
    const compileMs = spec.compileCommand ? spec.compileTimeLimitMs ?? 10_000 : 0;
    const wallMs = job.inputs.length * (timeLimitMs + 250) + compileMs + startupMs;
    const name = `exam-run-${randomUUID()}`;
    const args = this.sandboxArgs(job, name, wallMs);

    const harnessJob = JSON.stringify({
      compile: spec.compileCommand
        ? { cmd: resolveCommand(spec.compileCommand, job.limits), timeLimitMs: compileMs }
        : null,
      cmd: resolveCommand(spec.runCommand, job.limits),
      timeLimitMs,
      outputCapBytes,
      inputs: job.inputs,
    });

    const res = await this.spawnDocker(dockerBin, args, harnessJob, wallMs, name, {
      SRC: job.code,
      HARNESS: HARNESS_SOURCE,
    });

    if (res.spawnError || res.exitCode === 125 || res.exitCode === 126 || res.exitCode === 127) {
      // Docker itself failed (daemon down, image missing, bad flag, unknown runtime...).
      return unavailable(`Sandbox failed to start: ${res.spawnError ?? res.stderr.slice(0, 500)}`);
    }

    let parsed: HarnessResult[] | null = null;
    let compiled: HarnessCompileResult | null = null;
    let usage: SandboxUsage | null = null;
    try {
      const body = JSON.parse(res.stdout) as {
        compile?: HarnessCompileResult | null;
        results?: HarnessResult[];
        usage?: SandboxUsage;
      };
      if (Array.isArray(body.results)) parsed = body.results;
      compiled = body.compile ?? null;
      usage = body.usage ?? null;
    } catch {
      parsed = null;
    }
    const done = (outcomes: ExecutionOutcome[], harnessBroken = false) => ({
      outcomes,
      usage,
      killedByDeadline: res.killedByDeadline,
      harnessBroken,
    });

    if (compiled && compiled.ok === false) {
      if (compiled.spawnError) return unavailable(`Compile step failed to start: ${compiled.spawnError}`);
      const base = { status: ExecutionStatus.COMPILATION_ERROR, stdout: '', exitCode: compiled.exitCode ?? null, timeMs: 0 };
      let outcome: ExecutionOutcome;
      if (compiled.timedOut) {
        const message = `Compilation took longer than ${Math.round(compileMs / 1000)} seconds.`;
        outcome = { ...base, stderr: message, error: { kind: CodeErrorKind.OTHER, line: null, message } };
      } else {
        outcome = classifyOutcome({ ...base, stderr: compiled.output ?? '' }, job.language);
      }
      return done(job.inputs.map(() => ({ ...outcome })));
    }

    let harnessBroken = false;
    const outcomes = job.inputs.map((_, i) => {
      const r = parsed?.[i];
      if (r) return classifyOutcome(toOutcome(r, timeLimitMs), job.language);
      // No result for this input: the container was killed at the deadline,
      // ran out of memory, or the program broke the harness. All of these
      // are the program's doing, so they count against it.
      if (res.killedByDeadline) return failed(ExecutionStatus.TIME_LIMIT_EXCEEDED, timeLimitMs);
      if (res.exitCode === 137) return failed(ExecutionStatus.MEMORY_LIMIT_EXCEEDED, 0);
      harnessBroken = true;
      return failed(ExecutionStatus.RUNTIME_ERROR, 0, 'The program interfered with the test runner.');
    });
    return done(outcomes, harnessBroken);
  }

  private spawnDocker(
    bin: string,
    args: string[],
    stdin: string,
    wallMs: number,
    name: string,
    extraEnv: Record<string, string>,
  ): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    killedByDeadline: boolean;
    spawnError?: string;
  }> {
    // Harness output is bounded (per-input caps); this is a backstop.
    const maxCollect = 8 * 1024 * 1024;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killedByDeadline = false;
      let settled = false;

      const child = spawn(bin, args, {
        // Only what the docker CLI needs, so no API secrets reach `-e`-style inheritance.
        env: { ...dockerCliEnv(), ...extraEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        killedByDeadline = true;
        // Killing the CLI doesn't stop the container; kill it by name.
        spawn(bin, ['kill', name], { stdio: 'ignore' }).on('error', () => undefined);
        child.kill('SIGKILL');
      }, wallMs);

      const finish = (exitCode: number | null, spawnError?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode, stdout, stderr, killedByDeadline, spawnError });
      };

      child.stdout.on('data', (d: Buffer) => {
        if (stdout.length < maxCollect) stdout += d.toString('utf8');
      });
      child.stderr.on('data', (d: Buffer) => {
        if (stderr.length < maxCollect) stderr += d.toString('utf8');
      });
      child.on('error', (err) => finish(null, err.message));
      child.on('close', (code) => finish(code));

      child.stdin.on('error', () => undefined); // container may exit before reading all input
      child.stdin.end(stdin);
    });
  }
}

const DOCKER_CLI_ENV_KEYS = [
  'PATH',
  'HOME',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'DOCKER_CERT_PATH',
  'DOCKER_TLS_VERIFY',
  // DOCKER_HOST=ssh://… needs the SSH agent.
  'SSH_AUTH_SOCK',
];

function dockerCliEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of DOCKER_CLI_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function toOutcome(r: HarnessResult, timeLimitMs: number): ExecutionOutcome {
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  const timeMs = r.timeMs ?? 0;
  const exitCode = r.exitCode ?? null;

  if (r.spawnError) return failed(ExecutionStatus.RUNTIME_ERROR, 0, r.spawnError);

  let status: ExecutionStatus;
  if (r.timedOut) {
    status = ExecutionStatus.TIME_LIMIT_EXCEEDED;
  } else if (r.outputExceeded) {
    status = ExecutionStatus.OUTPUT_LIMIT_EXCEEDED;
  } else if (exitCode === -9 || /\bMemoryError\b|java\.lang\.OutOfMemoryError|std::bad_alloc/.test(stderr)) {
    // SIGKILL we didn't send is the kernel's OOM killer.
    status = ExecutionStatus.MEMORY_LIMIT_EXCEEDED;
  } else if (exitCode !== 0) {
    status = ExecutionStatus.RUNTIME_ERROR;
  } else {
    status = ExecutionStatus.OK;
  }

  return {
    status,
    stdout,
    stderr,
    exitCode,
    timeMs: status === ExecutionStatus.TIME_LIMIT_EXCEEDED ? Math.max(timeMs, timeLimitMs) : timeMs,
  };
}

function failed(status: ExecutionStatus, timeMs: number, stderr = ''): ExecutionOutcome {
  return { status, stdout: '', stderr, exitCode: null, timeMs };
}

function internalError(message: string): ExecutionOutcome {
  return failed(ExecutionStatus.INTERNAL_ERROR, 0, message);
}
