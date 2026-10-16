/**
 * Owner: Person B.
 *
 * Runs untrusted code in a throw-away Docker container per batch:
 * no network, read-only root filesystem, small /tmp, all capabilities
 * dropped, non-root user, memory/CPU/pid limits. The student's code and the
 * harness are passed as environment variables (inherited by `docker run -e`,
 * so they never appear in the host's process list) and written to /tmp
 * inside the container, so no host folder is mounted.
 *
 * The API host needs access to a Docker daemon. That access is
 * root-equivalent, so in production the daemon must be a dedicated runner
 * host holding no secrets (see docs/execution-security.md).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { ExecutionOutcome, ExecutionStatus } from '@secure-exam/types';
import { BatchExecutionJob, ExecutionProvider } from './execution-provider.interface';
import { HARNESS_SOURCE } from './harness';
import { getLanguageSpec } from './language.registry';

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

/** Extra memory for the harness and /tmp on top of the program's limit. */
const SANDBOX_MEMORY_OVERHEAD_MB = 64;
const TMPFS_SIZE_MB = 16;

@Injectable()
export class DockerRunnerProvider implements ExecutionProvider {
  private readonly logger = new Logger(DockerRunnerProvider.name);

  constructor(private readonly config: ConfigService) {}

  async runBatch(job: BatchExecutionJob): Promise<ExecutionOutcome[]> {
    if (job.inputs.length === 0) return [];

    const spec = getLanguageSpec(job.language);
    const image = this.config.get<string>(spec.imageEnvKey) ?? spec.defaultImage;
    const dockerBin = this.config.get<string>('RUNNER_DOCKER_BIN') ?? 'docker';
    const outputCapBytes = Number(this.config.get('RUNNER_OUTPUT_LIMIT_BYTES') ?? 65536);
    const startupMs = Number(this.config.get('RUNNER_STARTUP_TIMEOUT_MS') ?? 10000);

    // Whole-container deadline: every input may use its full time limit,
    // plus a small gap per input and the container start-up time.
    const wallMs = job.inputs.length * (job.limits.timeLimitMs + 250) + startupMs;
    const memoryMb = job.limits.memoryLimitMb + SANDBOX_MEMORY_OVERHEAD_MB;
    const name = `exam-run-${randomUUID()}`;

    const args = [
      'run', '--rm', '-i',
      '--name', name,
      '--network', 'none',
      '--ipc', 'none',
      '--read-only',
      '--tmpfs', `/tmp:rw,nosuid,nodev,size=${TMPFS_SIZE_MB}m`,
      '--memory', `${memoryMb}m`,
      '--memory-swap', `${memoryMb}m`,
      '--cpus', '1',
      '--pids-limit', '64',
      '--ulimit', 'nofile=64:64',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--user', '65534:65534',
      '--log-driver', 'none',
      '-e', 'SRC',
      '-e', 'HARNESS',
      image,
      'sh', '-c',
      `printf '%s' "$SRC" > ${spec.sourcePath} && printf '%s' "$HARNESS" > /tmp/.harness.py` +
        ' && unset SRC HARNESS && exec python3 -I -B /tmp/.harness.py',
    ];

    const harnessJob = JSON.stringify({
      cmd: spec.runCommand,
      timeLimitMs: job.limits.timeLimitMs,
      outputCapBytes,
      inputs: job.inputs,
    });

    const res = await this.spawnDocker(dockerBin, args, harnessJob, wallMs, name, {
      SRC: job.code,
      HARNESS: HARNESS_SOURCE,
    });

    if (res.spawnError || res.exitCode === 125 || res.exitCode === 126 || res.exitCode === 127) {
      // Docker itself failed (daemon down, image missing, bad flag...).
      this.logger.error(`Sandbox failed to start: ${res.spawnError ?? res.stderr.slice(0, 500)}`);
      return job.inputs.map(() => internalError('Code runner is unavailable. Please try again.'));
    }

    let parsed: HarnessResult[] | null = null;
    try {
      const body = JSON.parse(res.stdout) as { results?: HarnessResult[] };
      if (Array.isArray(body.results)) parsed = body.results;
    } catch {
      parsed = null;
    }

    return job.inputs.map((_, i) => {
      const r = parsed?.[i];
      if (r) return toOutcome(r, job.limits.timeLimitMs);
      // No result for this input: the container was killed at the deadline,
      // ran out of memory, or the program broke the harness. All of these
      // are the program's doing, so they count against it.
      if (res.killedByDeadline) return failed(ExecutionStatus.TIME_LIMIT_EXCEEDED, job.limits.timeLimitMs);
      if (res.exitCode === 137) return failed(ExecutionStatus.MEMORY_LIMIT_EXCEEDED, 0);
      return failed(ExecutionStatus.RUNTIME_ERROR, 0, 'The program interfered with the test runner.');
    });
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
  } else if (exitCode === -9 || /\bMemoryError\b/.test(stderr)) {
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
