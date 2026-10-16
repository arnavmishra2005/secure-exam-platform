/**
 * Runs real containers, so it is skipped unless RUNNER_DOCKER_TESTS=1
 * (`npm run test:runner --workspace=apps/api`). Needs Docker and the
 * python:3.12-slim image.
 */
import { ConfigService } from '@nestjs/config';
import { CodeLanguage, ExecutionStatus } from '@secure-exam/types';
import { DockerRunnerProvider } from './docker-runner.provider';
import { RunLimiterService } from './run-limiter.service';
import { BatchExecutionJob } from './execution-provider.interface';

const describeDocker = process.env.RUNNER_DOCKER_TESTS === '1' ? describe : describe.skip;

describeDocker('DockerRunnerProvider (real Docker)', () => {
  jest.setTimeout(60_000);

  const provider = new DockerRunnerProvider(new ConfigService({}));
  const run = (code: string, inputs: string[] = [''], timeLimitMs = 2000) =>
    provider.runBatch({
      language: CodeLanguage.PYTHON,
      code,
      inputs,
      limits: { timeLimitMs, memoryLimitMb: 128 },
    } satisfies BatchExecutionJob);

  it('runs hello world', async () => {
    const [r] = await run('print("hello")');
    expect(r.status).toBe(ExecutionStatus.OK);
    expect(r.stdout).toBe('hello\n');
    expect(r.exitCode).toBe(0);
  });

  it('runs once per input, in order', async () => {
    const results = await run('a, b = map(int, input().split())\nprint(a + b)', ['1 2', '10 20', '-5 5']);
    expect(results.map((r) => r.stdout)).toEqual(['3\n', '30\n', '0\n']);
    expect(results.every((r) => r.status === ExecutionStatus.OK)).toBe(true);
  });

  it('reports an uncaught exception as a runtime error with the traceback', async () => {
    const [r] = await run('raise ValueError("boom")');
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.stderr).toContain('ValueError: boom');
    expect(r.stderr).toContain('/tmp/main.py');
  });

  it('reports a syntax error as a runtime error', async () => {
    const [r] = await run('def f(:\n  pass');
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.stderr).toContain('SyntaxError');
  });

  it('stops an infinite loop at the time limit and still runs later inputs', async () => {
    const results = await run('n = int(input())\nwhile n == 0:\n    pass\nprint(n)', ['0', '7'], 1000);
    expect(results[0].status).toBe(ExecutionStatus.TIME_LIMIT_EXCEEDED);
    expect(results[1].status).toBe(ExecutionStatus.OK);
    expect(results[1].stdout).toBe('7\n');
  });

  it('has no network access', async () => {
    const [r] = await run(
      'import socket\nsocket.create_connection(("1.1.1.1", 80), timeout=2)\nprint("connected")',
    );
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.stdout).not.toContain('connected');
  });

  it('does not see the code or harness in its environment', async () => {
    const [r] = await run('import os\nprint(sorted(os.environ))');
    expect(r.stdout).not.toContain('SRC');
    expect(r.stdout).not.toContain('HARNESS');
  });

  describe('abuse', () => {
    const elapsed = async (fn: () => Promise<unknown>) => {
      const t = Date.now();
      await fn();
      return Date.now() - t;
    };

    it('contains a fork bomb and the next run still works', async () => {
      const ms = await elapsed(async () => {
        const [r] = await run('import os\nwhile True:\n    os.fork()', [''], 1000);
        expect(r.status).not.toBe(ExecutionStatus.OK);
        expect(r.status).not.toBe(ExecutionStatus.INTERNAL_ERROR);
      });
      expect(ms).toBeLessThan(15_000);
      const [after] = await run('print("still fine")');
      expect(after.stdout).toBe('still fine\n');
    });

    it('stops a single huge allocation as a memory limit error', async () => {
      const [r] = await run('x = bytearray(1024 * 1024 * 1024)\nprint(len(x))');
      expect(r.status).toBe(ExecutionStatus.MEMORY_LIMIT_EXCEEDED);
    });

    it('stops gradually growing memory as a memory limit error', async () => {
      const [r] = await run('a = []\nwhile True:\n    a.append(" " * 10**6)');
      expect(r.status).toBe(ExecutionStatus.MEMORY_LIMIT_EXCEEDED);
    });

    it('caps endless output', async () => {
      const [r] = await run('while True:\n    print("x" * 1000)');
      expect(r.status).toBe(ExecutionStatus.OUTPUT_LIMIT_EXCEEDED);
      expect(r.stdout.length).toBeLessThanOrEqual(65536);
    });

    it('cannot write outside /tmp', async () => {
      const results = await run(
        'import sys\npath = input()\ntry:\n    open(path, "w").write("x")\n    print("wrote")\nexcept OSError as e:\n    print(type(e).__name__)',
        ['/etc/evil', '/usr/local/lib/python3.12/os.py', '/home/evil'],
      );
      for (const r of results) expect(r.stdout).not.toContain('wrote');
    });

    it('runs as an unprivileged user with no secrets in its environment', async () => {
      const [r] = await run('import os\nprint(os.getuid())\nprint(sorted(os.environ))');
      expect(r.stdout.split('\n')[0]).toBe('65534');
      expect(r.stdout).not.toMatch(/DATABASE|JWT|SECRET|DOCKER/);
    });

    it('cannot kill the harness', async () => {
      const results = await run('import os, signal\nos.kill(os.getppid(), signal.SIGKILL)\nprint("after")', ['', '']);
      expect(results).toHaveLength(2);
      for (const r of results) expect(r.status).not.toBe(ExecutionStatus.INTERNAL_ERROR);
    });

    it('cannot forge an OK result by writing to the harness output', async () => {
      const forged = JSON.stringify({ results: [{ exitCode: 0, timedOut: false, timeMs: 1, stdout: 'FORGED', stderr: '', outputExceeded: false }] });
      const [r] = await run(`open("/proc/1/fd/1", "w").write(${JSON.stringify(forged)})\nprint("real")`);
      expect(r.stdout).not.toBe('FORGED');
    });

    it('does not let a background process outlive the run', async () => {
      const ms = await elapsed(async () => {
        const [r] = await run('import subprocess\nsubprocess.Popen(["sleep", "300"])\nprint("bye")');
        expect(r.stdout).toBe('bye\n');
      });
      expect(ms).toBeLessThan(10_000);
    });
  });

  it('queues 20 simultaneous runs behind the concurrency limit and completes them all', async () => {
    const limiter = new RunLimiterService(new ConfigService({ RUNNER_MAX_CONCURRENCY: 4 }));
    let maxActive = 0;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        limiter.run(`student-${i}`, () => {
          maxActive = Math.max(maxActive, limiter.stats().active);
          return run(`print(${i} * 2)`);
        }),
      ),
    );
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(results.map(([r]) => r.stdout)).toEqual(Array.from({ length: 20 }, (_, i) => `${i * 2}\n`));
  });
});
