/**
 * Runs real containers, so it is skipped unless RUNNER_DOCKER_TESTS=1
 * (`npm run test:runner --workspace=apps/api`). Needs Docker and the
 * python:3.12-slim image.
 */
import { ConfigService } from '@nestjs/config';
import { CodeLanguage, ExecutionStatus } from '@secure-exam/types';
import { DockerRunnerProvider } from './docker-runner.provider';
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
});
