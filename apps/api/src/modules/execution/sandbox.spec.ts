import { ConfigService } from '@nestjs/config';
import { CodeErrorKind, CodeLanguage, ExecutionStatus, type ExecutionOutcome } from '@secure-exam/types';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { DockerRunnerProvider, resolveSeccompProfile, RUNNER_DEADLINE_LABEL, RUNNER_LABEL } from './docker-runner.provider';
import { BatchExecutionJob } from './execution-provider.interface';
import { LANGUAGE_REGISTRY } from './language.registry';
import { describe as describeRun, isLimitRun, RunMonitorService, type RunReport } from './run-monitor.service';
import { overdueContainers } from './sandbox-reaper.service';

/** #19 sandbox hardening: the parts that need no Docker (real containers: docker-runner.provider.docker.spec.ts). */

const job: BatchExecutionJob = {
  language: CodeLanguage.PYTHON,
  code: 'print(1)',
  inputs: [''],
  limits: { timeLimitMs: 2000, memoryLimitMb: 128 },
};

const flagValue = (args: string[], flag: string) => args.filter((_, i) => args[i - 1] === flag);

describe('sandbox command line', () => {
  it('uses the stricter seccomp profile, labels with a deadline and a noexec /tmp by default', () => {
    const provider = new DockerRunnerProvider(new ConfigService({}));
    const before = Date.now();
    const args = provider.sandboxArgs(job, 'exam-run-x', 5000);
    const profile = flagValue(args, '--security-opt').find((v) => v.startsWith('seccomp='));
    expect(profile).toBe(`seccomp=${path.resolve('../../infra/runner/seccomp.json')}`);
    expect(flagValue(args, '--security-opt')).toContain('no-new-privileges');
    expect(flagValue(args, '--label')).toContain(`${RUNNER_LABEL}=1`);
    const deadline = Number(flagValue(args, '--label').find((l) => l.startsWith(RUNNER_DEADLINE_LABEL))!.split('=')[1]);
    expect(deadline).toBeGreaterThanOrEqual(before + 5000);
    expect(flagValue(args, '--tmpfs')).toEqual(['/tmp:rw,nosuid,nodev,noexec,size=16m']);
    expect(flagValue(args, '--pids-limit')).toEqual(['64']);
    expect(args).not.toContain('--runtime');
  });

  it('adds the gVisor runtime when configured', () => {
    const provider = new DockerRunnerProvider(new ConfigService({ RUNNER_DOCKER_RUNTIME: 'runsc' }));
    expect(flagValue(provider.sandboxArgs(job, 'n', 1000), '--runtime')).toEqual(['runsc']);
  });

  it("keeps Docker's own profile only when asked to", () => {
    const provider = new DockerRunnerProvider(new ConfigService({ RUNNER_SECCOMP_PROFILE: 'docker-default' }));
    expect(provider.sandboxArgs(job, 'n', 1000).some((a) => a.startsWith('seccomp='))).toBe(false);
  });

  it('refuses to start with a missing profile instead of running with a weaker one', () => {
    expect(() => resolveSeccompProfile('/nope/seccomp.json')).toThrow(/does not exist/);
  });

  it('applies per-language overrides (#16) and refuses a language that needs gVisor when it is not set', async () => {
    const spec = LANGUAGE_REGISTRY[CodeLanguage.PYTHON];
    const saved = spec.sandbox;
    spec.sandbox = { pidsLimit: 128, tmpfsMb: 64, tmpfsExec: true, requiresIsolatedRuntime: true };
    try {
      const args = new DockerRunnerProvider(new ConfigService({ RUNNER_DOCKER_RUNTIME: 'runsc' })).sandboxArgs(job, 'n', 1000);
      expect(flagValue(args, '--pids-limit')).toEqual(['128']);
      expect(flagValue(args, '--tmpfs')).toEqual(['/tmp:rw,nosuid,nodev,exec,size=64m']);

      const [outcome] = await new DockerRunnerProvider(new ConfigService({ RUNNER_DOCKER_BIN: '/nonexistent' })).runBatch(job);
      expect(outcome.status).toBe(ExecutionStatus.INTERNAL_ERROR);
    } finally {
      spec.sandbox = saved;
    }
  });
});

describe('seccomp profile (infra/runner/seccomp.json)', () => {
  const file = path.resolve('../../infra/runner/seccomp.json');
  const profile = JSON.parse(readFileSync(file, 'utf8')) as {
    defaultAction: string;
    syscalls: Array<{ names: string[]; action: string; args?: unknown[]; includes?: { caps?: string[] } }>;
  };
  const allowed = (name: string) => profile.syscalls.filter((r) => r.action === 'SCMP_ACT_ALLOW' && r.names.includes(name));
  const DENIED = ['ptrace', 'mount', 'umount2', 'unshare', 'setns', 'bpf', 'keyctl', 'add_key', 'perf_event_open', 'userfaultfd', 'personality', 'kexec_load', 'init_module', 'io_uring_setup'];

  it('exists and denies by default', () => {
    expect(existsSync(file)).toBe(true);
    expect(profile.defaultAction).toBe('SCMP_ACT_ERRNO');
  });

  it.each(DENIED)('never allows %s and kills the program on it', (name) => {
    expect(allowed(name)).toEqual([]);
    expect(profile.syscalls.some((r) => r.action === 'SCMP_ACT_KILL_PROCESS' && r.names.includes(name))).toBe(true);
  });

  it('allows socket() only for AF_UNIX', () => {
    expect(allowed('socket')).toEqual([expect.objectContaining({ args: [{ index: 0, value: 1, op: 'SCMP_CMP_EQ' }] })]);
  });

  it('has no rules that depend on capabilities (the sandbox has none)', () => {
    expect(profile.syscalls.some((r) => r.includes?.caps?.length)).toBe(false);
  });
});

describe('run monitoring', () => {
  const outcome = (status: ExecutionStatus, kind?: CodeErrorKind): ExecutionOutcome => ({
    status,
    stdout: '',
    stderr: '',
    exitCode: 1,
    timeMs: 5,
    ...(kind && { error: { kind, line: null, message: '' } }),
  });
  const report = (over: Partial<RunReport> = {}, ctx: Partial<NonNullable<BatchExecutionJob['context']>> = {}): RunReport => ({
    job: { ...job, context: { source: 'GRADING', userId: 'u-1', attemptId: 'a-1', examId: 'e-1', questionId: 'q-1', ...ctx } },
    outcomes: [outcome(ExecutionStatus.OK)],
    usage: { memoryPeakBytes: 20 * 1048576, pidsLimitHits: 0, oomKills: 0 },
    killedByDeadline: false,
    harnessBroken: false,
    runtime: '',
    wallMs: 300,
    ...over,
  });
  const setup = (config: Record<string, unknown> = {}) => {
    const sink = { report: jest.fn(() => Promise.resolve()) };
    return { sink, monitor: new RunMonitorService(sink, new ConfigService(config)) };
  };

  it('logs a run without code or output', () => {
    const line = describeRun(report({ outcomes: [outcome(ExecutionStatus.OK), outcome(ExecutionStatus.TIME_LIMIT_EXCEEDED)] }));
    expect(line).toBe(
      'GRADING attempt=a-1 question=q-1 user=u-1 lang=python inputs=1 verdicts=OK×1,TLE×1 maxMs=5 wallMs=300 memMb=20 pidsHits=0 oomKills=0 runtime=runc',
    );
  });

  it('flags a blocked call, a process-limit hit and harness tampering, once per question', () => {
    const { sink, monitor } = setup();
    const blocked = report({ outcomes: [outcome(ExecutionStatus.RUNTIME_ERROR, CodeErrorKind.BLOCKED_SYSCALL)] });
    monitor.observe(blocked);
    monitor.observe(blocked);
    monitor.observe(report({ usage: { pidsLimitHits: 3 } }));
    monitor.observe(report({ harnessBroken: true }, { questionId: 'q-2' }));
    expect(sink.report.mock.calls.map(([e]: unknown[]) => (e as { reason: string }).reason)).toEqual([
      'BLOCKED_SYSCALL',
      'PROCESS_LIMIT',
      'HARNESS_TAMPERING',
    ]);
    expect(sink.report).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: 'a-1', examId: 'e-1', studentId: 'u-1', questionId: 'q-1', detail: expect.stringContaining('grading') }),
    );
  });

  it('flags repeated limit runs per attempt only after the threshold', () => {
    const { sink, monitor } = setup({ RUNNER_FLAG_LIMIT_BATCHES: 2 });
    monitor.observe(report({ killedByDeadline: true }));
    expect(sink.report).not.toHaveBeenCalled();
    monitor.observe(report({ outcomes: [outcome(ExecutionStatus.MEMORY_LIMIT_EXCEEDED)] }, { questionId: 'q-2' }));
    expect(sink.report).toHaveBeenCalledWith(expect.objectContaining({ reason: 'REPEATED_LIMITS' }));
  });

  it('does not count ordinary time limits or wrong answers as limit runs', () => {
    expect(isLimitRun(report({ outcomes: [outcome(ExecutionStatus.TIME_LIMIT_EXCEEDED)] }))).toBe(false);
    expect(isLimitRun(report({ outcomes: [outcome(ExecutionStatus.MEMORY_LIMIT_EXCEEDED), outcome(ExecutionStatus.OK)] }))).toBe(false);
  });

  it("only logs an author's reference-solution check (no attempt to flag)", () => {
    const { sink, monitor } = setup();
    monitor.observe(report({ usage: { pidsLimitHits: 9 } }, { source: 'VALIDATION', attemptId: undefined, examId: undefined }));
    expect(sink.report).not.toHaveBeenCalled();
  });

  it('never throws, even if the sink fails', async () => {
    const sink = { report: jest.fn(() => Promise.reject(new Error('db down'))) };
    const monitor = new RunMonitorService(sink, new ConfigService({}));
    expect(() => monitor.observe(report({ harnessBroken: true }))).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
});

describe('sandbox reaper', () => {
  it('picks containers past their deadline plus a grace period, and ones with no readable deadline', () => {
    const now = 1_000_000;
    const ps = ['exam-run-a 900000', 'exam-run-b 990000', 'exam-run-c 2000000', 'exam-run-d ', ''].join('\n');
    expect(overdueContainers(ps, now, 30_000)).toEqual(['exam-run-a', 'exam-run-d']);
  });
});
