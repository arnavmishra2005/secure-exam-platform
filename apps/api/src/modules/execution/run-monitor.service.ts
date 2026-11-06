/**
 * Owner: Person B.
 *
 * Logs one line per sandbox run (who, what, verdicts, time, memory, process
 * limit hits) and flags runs that look like an attack on the sandbox rather
 * than a wrong answer. A flag goes to SUSPICIOUS_CODE_SINK (security_events,
 * shown on Monitoring/Results) and never blocks or changes a score:
 * `import os` or an accidental infinite loop is normal in student code.
 *
 * Flags (each at most once per attempt, question and reason):
 *  - BLOCKED_SYSCALL: the seccomp filter killed the program (ptrace, mount...).
 *  - PROCESS_LIMIT: the program hit the sandbox's process cap (fork bomb).
 *  - HARNESS_TAMPERING: the program broke the in-sandbox test harness.
 *  - REPEATED_LIMITS: RUNNER_FLAG_LIMIT_BATCHES runs of one attempt were
 *    stopped by the container deadline or hit memory/output limits on every test.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CodeErrorKind, ExecutionOutcome, ExecutionStatus } from '@secure-exam/types';
import { BatchExecutionJob } from './execution-provider.interface';
import { SUSPICIOUS_CODE_SINK, SuspiciousCodeSink } from './suspicious-code.sink';

/** Container-wide counters the harness reads from its cgroup at the end of a run. */
export interface SandboxUsage {
  memoryPeakBytes?: number;
  /** Times a fork/clone failed because of --pids-limit. */
  pidsLimitHits?: number;
  oomKills?: number;
}

export interface RunReport {
  job: BatchExecutionJob;
  outcomes: ExecutionOutcome[];
  usage: SandboxUsage | null;
  /** The API killed the container at its overall deadline. */
  killedByDeadline: boolean;
  /** The program broke the harness (missing or unreadable results). */
  harnessBroken: boolean;
  /** Docker runtime, e.g. runsc; empty for Docker's default. */
  runtime: string;
  wallMs: number;
}

export type SuspicionReason = 'BLOCKED_SYSCALL' | 'PROCESS_LIMIT' | 'HARNESS_TAMPERING' | 'REPEATED_LIMITS';

const REASON_TEXT: Record<SuspicionReason, string> = {
  BLOCKED_SYSCALL: 'Code was stopped by the sandbox for a blocked system call',
  PROCESS_LIMIT: 'Code hit the sandbox process limit (possible fork bomb)',
  HARNESS_TAMPERING: 'Code interfered with the test runner',
  REPEATED_LIMITS: 'Code repeatedly hit the sandbox time, memory or output limits',
};

const SHORT_STATUS: Partial<Record<ExecutionStatus, string>> = {
  [ExecutionStatus.OK]: 'OK',
  [ExecutionStatus.RUNTIME_ERROR]: 'RE',
  [ExecutionStatus.COMPILATION_ERROR]: 'CE',
  [ExecutionStatus.TIME_LIMIT_EXCEEDED]: 'TLE',
  [ExecutionStatus.MEMORY_LIMIT_EXCEEDED]: 'MLE',
  [ExecutionStatus.OUTPUT_LIMIT_EXCEEDED]: 'OLE',
  [ExecutionStatus.INTERNAL_ERROR]: 'IE',
};

const DEFAULT_LIMIT_BATCHES = 3;
const MAX_REMEMBERED = 20_000;

/** The reasons a single run is suspicious on its own (REPEATED_LIMITS needs history). */
export function immediateReasons(report: RunReport): SuspicionReason[] {
  const reasons: SuspicionReason[] = [];
  if (report.outcomes.some((o) => o.error?.kind === CodeErrorKind.BLOCKED_SYSCALL)) reasons.push('BLOCKED_SYSCALL');
  if ((report.usage?.pidsLimitHits ?? 0) > 0) reasons.push('PROCESS_LIMIT');
  if (report.harnessBroken) reasons.push('HARNESS_TAMPERING');
  return reasons;
}

/** Stopped at the container deadline, or every test hit the memory or output limit. */
export function isLimitRun(report: RunReport): boolean {
  if (report.killedByDeadline) return true;
  const limited = new Set([ExecutionStatus.MEMORY_LIMIT_EXCEEDED, ExecutionStatus.OUTPUT_LIMIT_EXCEEDED]);
  return report.outcomes.length > 0 && report.outcomes.every((o) => limited.has(o.status));
}

@Injectable()
export class RunMonitorService {
  private readonly logger = new Logger('SandboxRun');
  /** attemptId → runs that hit limits. */
  private readonly limitRuns = new Map<string, number>();
  /** attemptId|questionId|reason already flagged. */
  private readonly flagged = new Set<string>();

  constructor(
    @Optional() @Inject(SUSPICIOUS_CODE_SINK) private readonly sink?: SuspiciousCodeSink,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Never throws and never waits on the sink: monitoring must not slow down or break grading. */
  observe(report: RunReport): void {
    try {
      this.logger.log(describe(report));
      const reasons = immediateReasons(report);
      const attemptId = report.job.context?.attemptId;
      if (attemptId && isLimitRun(report)) {
        const runs = (this.limitRuns.get(attemptId) ?? 0) + 1;
        this.remember(this.limitRuns, attemptId, runs);
        if (runs >= this.limitBatches()) reasons.push('REPEATED_LIMITS');
      }
      for (const reason of reasons) this.flag(report, reason);
    } catch (err) {
      this.logger.warn(`Run monitoring failed: ${(err as Error).message}`);
    }
  }

  private flag(report: RunReport, reason: SuspicionReason): void {
    const ctx = report.job.context;
    const where = `${ctx?.source ?? 'UNKNOWN'} question=${ctx?.questionId ?? '-'} user=${ctx?.userId ?? '-'}`;
    this.logger.warn(`Suspicious code (${reason}): ${where} attempt=${ctx?.attemptId ?? '-'}`);
    // Only a student's attempt can be flagged on Monitoring; an author's
    // "Test reference solution" is logged above and nothing more.
    if (!this.sink || !ctx?.attemptId || !ctx.examId) return;
    // REPEATED_LIMITS is per attempt; the others per question.
    const key = [ctx.attemptId, reason === 'REPEATED_LIMITS' ? '*' : ctx.questionId ?? '-', reason].join('|');
    if (this.flagged.has(key)) return;
    if (this.flagged.size >= MAX_REMEMBERED) this.flagged.clear();
    this.flagged.add(key);
    const detail = `${REASON_TEXT[reason]} (${ctx.source === 'RUN' ? 'practice run' : 'grading'})`;
    void this.sink
      .report({ attemptId: ctx.attemptId, examId: ctx.examId, studentId: ctx.userId, questionId: ctx.questionId, reason, detail })
      .catch((err: Error) => this.logger.warn(`Could not report suspicious code: ${err.message}`));
  }

  private limitBatches(): number {
    return Number(this.config?.get('RUNNER_FLAG_LIMIT_BATCHES')) || DEFAULT_LIMIT_BATCHES;
  }

  private remember<V>(map: Map<string, V>, key: string, value: V): void {
    if (!map.has(key) && map.size >= MAX_REMEMBERED) map.clear();
    map.set(key, value);
  }
}

/** One log line, no code or output: e.g. `GRADING attempt=… question=… user=… verdicts=OK×2,TLE×1 maxMs=2000 memMb=31 pidsHits=0`. */
export function describe(report: RunReport): string {
  const ctx = report.job.context;
  const counts = new Map<string, number>();
  for (const o of report.outcomes) {
    const s = SHORT_STATUS[o.status] ?? o.status;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const verdicts = [...counts].map(([s, n]) => `${s}×${n}`).join(',') || 'none';
  const maxMs = Math.max(0, ...report.outcomes.map((o) => o.timeMs));
  const memMb = report.usage?.memoryPeakBytes !== undefined ? Math.round(report.usage.memoryPeakBytes / 1048576) : '?';
  return [
    ctx?.source ?? 'UNKNOWN',
    `attempt=${ctx?.attemptId ?? '-'}`,
    `question=${ctx?.questionId ?? '-'}`,
    `user=${ctx?.userId ?? '-'}`,
    `lang=${report.job.language}`,
    `inputs=${report.job.inputs.length}`,
    `verdicts=${verdicts}`,
    `maxMs=${maxMs}`,
    `wallMs=${report.wallMs}`,
    `memMb=${memMb}`,
    `pidsHits=${report.usage?.pidsLimitHits ?? '?'}`,
    `oomKills=${report.usage?.oomKills ?? '?'}`,
    report.killedByDeadline ? 'deadline=killed' : null,
    report.harnessBroken ? 'harness=broken' : null,
    `runtime=${report.runtime || 'runc'}`,
  ]
    .filter(Boolean)
    .join(' ');
}
