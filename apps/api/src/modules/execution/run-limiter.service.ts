/**
 * Owner: Person B.
 *
 * Keeps code execution from overwhelming the runner host:
 *  - at most RUNNER_MAX_CONCURRENCY containers at once; the rest wait in a
 *    FIFO queue capped at RUNNER_MAX_QUEUE (beyond that: 503, try again);
 *  - one run at a time per student (a second click while one is running: 429);
 *  - at most RUNNER_RUNS_PER_MINUTE runs per student per rolling minute (429).
 *
 * Per-student limits are keyed by user id, not IP: lab machines often share
 * one NAT address, which the global IP throttler can't tell apart.
 *
 * In-memory, so it is per API instance. Running several instances needs a
 * shared store (Redis) or a real queue; that's the Judge0/BullMQ swap path.
 */

import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WINDOW_MS = 60_000;

@Injectable()
export class RunLimiterService {
  private readonly maxConcurrency: number;
  private readonly maxQueue: number;
  private readonly runsPerMinute: number;

  private active = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly busyStudents = new Set<string>();
  private readonly recentRuns = new Map<string, number[]>();

  constructor(config: ConfigService) {
    this.maxConcurrency = Number(config.get('RUNNER_MAX_CONCURRENCY') ?? 4);
    this.maxQueue = Number(config.get('RUNNER_MAX_QUEUE') ?? 100);
    this.runsPerMinute = Number(config.get('RUNNER_RUNS_PER_MINUTE') ?? 20);
  }

  /** Runs `work` once the student's limits and a free slot allow it. */
  async run<T>(studentId: string, work: () => Promise<T>, now = Date.now()): Promise<T> {
    if (this.busyStudents.has(studentId)) {
      throw new HttpException('Your previous run is still in progress', HttpStatus.TOO_MANY_REQUESTS);
    }

    const recent = (this.recentRuns.get(studentId) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= this.runsPerMinute) {
      const retryInS = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
      throw new HttpException(
        `Too many runs. Try again in ${retryInS} s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (this.active >= this.maxConcurrency && this.waiting.length >= this.maxQueue) {
      throw new ServiceUnavailableException('The code runner is busy. Try again in a moment');
    }

    recent.push(now);
    this.recentRuns.set(studentId, recent);
    this.busyStudents.add(studentId);
    try {
      await this.acquire();
      try {
        return await work();
      } finally {
        this.release();
      }
    } finally {
      this.busyStudents.delete(studentId);
    }
  }

  /** For monitoring and tests. */
  stats() {
    return { active: this.active, queued: this.waiting.length, busyStudents: this.busyStudents.size };
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++;
      return Promise.resolve();
    }
    // The releasing run hands its slot straight to the next waiter.
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}
