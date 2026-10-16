import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RunLimiterService } from './run-limiter.service';

function limiter(env: Record<string, number>) {
  return new RunLimiterService(new ConfigService(env));
}

/** A job that stays running until `finish()` is called. */
function pendingJob() {
  let finish!: () => void;
  const done = new Promise<void>((r) => (finish = r));
  return { work: () => done.then(() => 'ok'), finish };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('RunLimiterService', () => {
  it('runs at most RUNNER_MAX_CONCURRENCY jobs at once and queues the rest in order', async () => {
    const l = limiter({ RUNNER_MAX_CONCURRENCY: 2 });
    const jobs = [pendingJob(), pendingJob(), pendingJob()];
    const order: number[] = [];
    const runs = jobs.map((j, i) =>
      l.run(`s${i}`, () => {
        order.push(i);
        return j.work();
      }),
    );
    await flush();
    expect(l.stats()).toEqual({ active: 2, queued: 1, busyStudents: 3 });
    expect(order).toEqual([0, 1]);

    jobs[0].finish();
    await flush();
    expect(order).toEqual([0, 1, 2]);
    expect(l.stats().active).toBe(2);

    jobs[1].finish();
    jobs[2].finish();
    await Promise.all(runs);
    expect(l.stats()).toEqual({ active: 0, queued: 0, busyStudents: 0 });
  });

  it('rejects a second run by the same student while the first is running', async () => {
    const l = limiter({});
    const job = pendingJob();
    const first = l.run('s1', job.work);
    await expect(l.run('s1', async () => 'x')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    job.finish();
    await first;
    await expect(l.run('s1', async () => 'again')).resolves.toBe('again');
  });

  it('frees the student and the slot when the job throws', async () => {
    const l = limiter({ RUNNER_MAX_CONCURRENCY: 1 });
    await expect(l.run('s1', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(l.stats()).toEqual({ active: 0, queued: 0, busyStudents: 0 });
    await expect(l.run('s1', async () => 'ok')).resolves.toBe('ok');
  });

  it('limits runs per student per rolling minute', async () => {
    const l = limiter({ RUNNER_RUNS_PER_MINUTE: 2 });
    const t0 = 1_000_000;
    await l.run('s1', async () => 1, t0);
    await l.run('s1', async () => 2, t0 + 1000);
    const err = await l.run('s1', async () => 3, t0 + 2000).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    // Other students are unaffected; the window rolls forward.
    await expect(l.run('s2', async () => 'other', t0 + 2000)).resolves.toBe('other');
    await expect(l.run('s1', async () => 'later', t0 + 60_001)).resolves.toBe('later');
  });

  it('returns 503 when the queue is full', async () => {
    const l = limiter({ RUNNER_MAX_CONCURRENCY: 1, RUNNER_MAX_QUEUE: 1 });
    const a = pendingJob();
    const b = pendingJob();
    const ra = l.run('a', a.work);
    const rb = l.run('b', b.work);
    await flush();
    await expect(l.run('c', async () => 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    a.finish();
    b.finish();
    await Promise.all([ra, rb]);
  });
});
