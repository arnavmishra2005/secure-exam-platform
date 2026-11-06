/**
 * Runs real containers, so it is skipped unless RUNNER_DOCKER_TESTS=1
 * (`npm run test:runner --workspace=apps/api`). Needs Docker and the
 * python:3.12-slim image.
 */
import { ConfigService } from '@nestjs/config';
import { CodeErrorKind, CodeLanguage, ExecutionStatus } from '@secure-exam/types';
import { execFileSync } from 'child_process';
import { DockerRunnerProvider, RUNNER_DEADLINE_LABEL, RUNNER_LABEL } from './docker-runner.provider';
import { RunMonitorService } from './run-monitor.service';
import { SandboxReaperService } from './sandbox-reaper.service';
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

  it('classifies a runtime error with its line', async () => {
    const [r] = await run('x = 1\nprint(y)');
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.error).toMatchObject({ kind: CodeErrorKind.NAME, line: 2 });
  });

  it('reports a syntax error as a compilation error on every input, without running the code', async () => {
    const results = await run('print("ran")\ndef f(:\n  pass', ['', '']);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.status).toBe(ExecutionStatus.COMPILATION_ERROR);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain('SyntaxError');
      expect(r.error).toMatchObject({ kind: CodeErrorKind.SYNTAX, line: 2 });
    }
  });

  it('reports an indentation error as a compilation error', async () => {
    const [r] = await run('if True:\nprint(1)');
    expect(r.status).toBe(ExecutionStatus.COMPILATION_ERROR);
    expect(r.stderr).toContain('IndentationError');
    expect(r.error).toMatchObject({ kind: CodeErrorKind.INDENTATION, line: 2 });
  });

  it('keeps a SyntaxError raised by eval() a runtime error', async () => {
    const [r] = await run('eval("1+")');
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.error).toMatchObject({ kind: CodeErrorKind.SYNTAX, line: 1 });
  });

  it('reports a crash signal', async () => {
    const [r] = await run('import os\nos.abort()');
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.error).toMatchObject({ kind: CodeErrorKind.ABORT });
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
      // Generous time limit: on a slow Docker VM, memory reclaim before the OOM kill can outlast 2 s.
      const [r] = await run('x = bytearray(1024 * 1024 * 1024)\nprint(len(x))', [''], 10_000);
      expect(r.status).toBe(ExecutionStatus.MEMORY_LIMIT_EXCEEDED);
    });

    it('stops gradually growing memory as a memory limit error', async () => {
      // 10 MB steps and a generous time limit, so a slow Docker VM can't turn this into a timeout.
      const [r] = await run('a = []\nwhile True:\n    a.append(" " * 10**7)', [''], 10_000);
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

  describe('system-call filter (#19)', () => {
    // Raw calls through ctypes, as a hostile solution would make them. Numbers
    // for calls without a libc wrapper differ per CPU (Docker Desktop on Apple
    // silicon is aarch64; most servers are x86_64).
    const SYSCALL = `import ctypes, platform
libc = ctypes.CDLL(None, use_errno=True)
NR = {"x86_64": {"bpf": 321, "keyctl": 250, "io_uring_setup": 425, "userfaultfd": 323},
      "aarch64": {"bpf": 280, "keyctl": 219, "io_uring_setup": 425, "userfaultfd": 282}}[platform.machine()]
`;
    const blocked: Array<[string, string]> = [
      ['ptrace', 'libc.ptrace(0, 0, 0, 0)'],
      ['unshare (new user namespace)', 'libc.unshare(0x10000000)'],
      ['mount', 'libc.mount(b"none", b"/tmp", b"tmpfs", 0, None)'],
      ['personality', 'libc.personality(0x0040000)'],
      ['bpf', 'libc.syscall(NR["bpf"], 0, 0, 0)'],
      ['keyctl', 'libc.syscall(NR["keyctl"], 0, 0, 0)'],
      ['io_uring_setup', 'libc.syscall(NR["io_uring_setup"], 1, 0)'],
      ['userfaultfd', 'libc.syscall(NR["userfaultfd"], 0)'],
    ];

    it.each(blocked)('kills the program on %s and reports it as blocked', async (_name, call) => {
      const [r] = await run(`${SYSCALL}print("before", flush=True)\n${call}\nprint("after")`);
      expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
      expect(r.error).toMatchObject({ kind: CodeErrorKind.BLOCKED_SYSCALL });
      expect(r.stdout).toBe('before\n');
    });

    it('refuses internet sockets without killing the program', async () => {
      const [r] = await run(
        'import socket\ntry:\n    socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n    print("created")\nexcept OSError as e:\n    print("refused", type(e).__name__)',
      );
      expect(r.status).toBe(ExecutionStatus.OK);
      expect(r.stdout).toBe('refused PermissionError\n');
    });

    it('still allows local sockets, subprocesses and threads that ordinary code uses', async () => {
      const [r] = await run(
        [
          'import socket, subprocess, threading',
          'a, b = socket.socketpair(); a.sendall(b"x"); print(b.recv(1).decode())',
          'print(subprocess.run(["python3", "-c", "print(2)"], capture_output=True, text=True).stdout.strip())',
          't = threading.Thread(target=lambda: print(3)); t.start(); t.join()',
        ].join('\n'),
      );
      expect(r.status).toBe(ExecutionStatus.OK);
      expect(r.stdout).toBe('x\n2\n3\n');
    });

    it("cannot read the harness's environment for the code or harness source", async () => {
      const [r] = await run('print(open("/proc/1/environ", "rb").read().replace(b"\\0", b" ").decode())');
      expect(r.stdout).not.toMatch(/\bSRC=|HARNESS=/);
      expect(r.stdout).not.toMatch(/DATABASE|JWT|SECRET/);
    });
  });

  describe('run monitoring (#19)', () => {
    const sink = { report: jest.fn(() => Promise.resolve()) };
    const monitored = new DockerRunnerProvider(new ConfigService({}), new RunMonitorService(sink, new ConfigService({})));
    const context = { source: 'GRADING' as const, userId: 'u-1', attemptId: 'a-1', examId: 'e-1', questionId: 'q-1' };
    const runAs = (code: string, questionId: string) =>
      monitored.runBatch({
        language: CodeLanguage.PYTHON,
        code,
        inputs: [''],
        limits: { timeLimitMs: 1000, memoryLimitMb: 128 },
        context: { ...context, questionId },
      });

    beforeEach(() => sink.report.mockClear());

    it('flags a blocked system call on Monitoring', async () => {
      await runAs('import ctypes\nctypes.CDLL(None).ptrace(0, 0, 0, 0)', 'q-ptrace');
      await new Promise((r) => setImmediate(r));
      expect(sink.report).toHaveBeenCalledWith(
        expect.objectContaining({ attemptId: 'a-1', examId: 'e-1', studentId: 'u-1', questionId: 'q-ptrace', reason: 'BLOCKED_SYSCALL' }),
      );
    });

    it('flags a fork bomb through the process limit', async () => {
      await runAs('import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass', 'q-fork');
      await new Promise((r) => setImmediate(r));
      expect(sink.report).toHaveBeenCalledWith(expect.objectContaining({ questionId: 'q-fork', reason: 'PROCESS_LIMIT' }));
    });

    it('does not flag ordinary wrong code', async () => {
      await runAs('print(1/0)', 'q-plain');
      await new Promise((r) => setImmediate(r));
      expect(sink.report).not.toHaveBeenCalled();
    });
  });

  it('reaper removes a labelled sandbox container left past its deadline, and nothing else', async () => {
    const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
    const stale = `exam-run-stale-${Date.now()}`;
    const other = `not-a-sandbox-${Date.now()}`;
    docker('run', '-d', '--name', stale, '--label', `${RUNNER_LABEL}=1`, '--label', `${RUNNER_DEADLINE_LABEL}=${Date.now() - 60_000}`, 'python:3.12-slim', 'sleep', '300');
    docker('run', '-d', '--name', other, 'python:3.12-slim', 'sleep', '300');
    try {
      await new SandboxReaperService(new ConfigService({})).reap();
      expect(docker('ps', '-a', '--filter', `name=${stale}`, '--format', '{{.Names}}')).toBe('');
      expect(docker('ps', '--filter', `name=${other}`, '--format', '{{.Names}}')).toBe(other);
    } finally {
      execFileSync('docker', ['rm', '-f', stale, other], { stdio: 'ignore' });
    }
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

/**
 * C, C++ and Java (#16). Needs the images from infra/runner-images
 * (`npm run runner:images --workspace=apps/api`).
 */
describeDocker('DockerRunnerProvider: C, C++ and Java', () => {
  jest.setTimeout(120_000);
  const provider = new DockerRunnerProvider(new ConfigService({}));
  const run = (language: CodeLanguage, code: string, inputs: string[] = [''], timeLimitMs = 2000, memoryLimitMb = 128) =>
    provider.runBatch({ language, code, inputs, limits: { timeLimitMs, memoryLimitMb } });

  const SUM: Record<string, string> = {
    [CodeLanguage.C]: '#include <stdio.h>\nint main(void){ long a,b; scanf("%ld %ld",&a,&b); printf("%ld\\n",a+b); return 0; }',
    [CodeLanguage.CPP]: '#include <bits/stdc++.h>\nusing namespace std;\nint main(){ long long a,b; cin>>a>>b; cout<<a+b<<"\\n"; }',
    [CodeLanguage.JAVA]:
      'import java.util.*;\npublic class Main { public static void main(String[] a){ Scanner s=new Scanner(System.in); System.out.println(s.nextLong()+s.nextLong()); } }',
  };
  const COMPILE_ERROR: Record<string, [string, number]> = {
    [CodeLanguage.C]: ['#include <stdio.h>\nint main(void){\n  int x = undeclared;\n  return 0;\n}', 3],
    [CodeLanguage.CPP]: ['int main(){\n  undefined_name();\n}', 2],
    [CodeLanguage.JAVA]: ['public class Main {\n  public static void main(String[] a){\n    int x = "s";\n  }\n}', 3],
  };

  describe.each([CodeLanguage.C, CodeLanguage.CPP, CodeLanguage.JAVA])('%s', (language) => {
    it('compiles once and runs every input', async () => {
      const results = await run(language, SUM[language], ['1 2', '40 2', '-5 5']);
      expect(results.map((r) => r.status)).toEqual([ExecutionStatus.OK, ExecutionStatus.OK, ExecutionStatus.OK]);
      expect(results.map((r) => r.stdout)).toEqual(['3\n', '42\n', '0\n']);
    });

    it('reports a compiler error on every input with its line, without running', async () => {
      const [code, line] = COMPILE_ERROR[language];
      const results = await run(language, code, ['', '']);
      for (const r of results) {
        expect(r.status).toBe(ExecutionStatus.COMPILATION_ERROR);
        expect(r.error).toMatchObject({ kind: CodeErrorKind.COMPILE, line });
      }
    });

    it('stops an infinite loop at the time limit', async () => {
      const loop =
        language === CodeLanguage.JAVA
          ? 'public class Main { public static void main(String[] a){ while(true){} } }'
          : 'int main(){ volatile int x=0; for(;;) x++; }';
      const [r] = await run(language, loop, [''], 1000);
      expect(r.status).toBe(ExecutionStatus.TIME_LIMIT_EXCEEDED);
    });

    it('stops unbounded memory as a memory limit error', async () => {
      const bomb =
        language === CodeLanguage.JAVA
          ? 'import java.util.*;\npublic class Main { public static void main(String[] a){ List<long[]> l=new ArrayList<>(); while(true) l.add(new long[1<<20]); } }'
          : '#include <stdlib.h>\n#include <string.h>\nint main(){ for(;;){ char*p=(char*)malloc(1<<24); if(!p) return 3; memset(p,1,1<<24);} }';
      const [r] = await run(language, bomb, [''], 10_000, 64);
      expect([ExecutionStatus.MEMORY_LIMIT_EXCEEDED, ExecutionStatus.RUNTIME_ERROR]).toContain(r.status);
      expect(r.status).not.toBe(ExecutionStatus.OK);
    });

    it('contains a fork or thread bomb and the next run still works', async () => {
      const bomb =
        language === CodeLanguage.JAVA
          ? 'public class Main { public static void main(String[] a){ while(true){ new Thread(() -> { try { Thread.sleep(100000); } catch (Exception e) {} }).start(); } } }'
          : '#include <unistd.h>\nint main(){ for(;;) fork(); }';
      const [r] = await run(language, bomb, [''], 1000);
      expect(r.status).not.toBe(ExecutionStatus.OK);
      expect(r.status).not.toBe(ExecutionStatus.INTERNAL_ERROR);
      const [after] = await run(language, SUM[language], ['2 2']);
      expect(after.stdout).toBe('4\n');
    });
  });

  it('C: a null-pointer write is a segmentation fault', async () => {
    const [r] = await run(CodeLanguage.C, 'int main(){ int *p = 0; *p = 1; return 0; }');
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.error).toMatchObject({ kind: CodeErrorKind.SEGFAULT });
  });

  // arm64 CPUs don't trap on integer division by zero (the result is 0), so only x86-64 checks this.
  (process.arch === 'x64' ? it : it.skip)('C: integer division by zero is a floating-point error', async () => {
    const [r] = await run(CodeLanguage.C, '#include <stdio.h>\nint main(){ int a, b; scanf("%d %d",&a,&b); printf("%d", a/b); }', ['1 0']);
    expect(r.error).toMatchObject({ kind: CodeErrorKind.ZERO_DIVISION });
  });

  it('C: deep recursion fits the 64 MB stack', async () => {
    const [r] = await run(CodeLanguage.C, '#include <stdio.h>\nint f(int n){ volatile char pad[32]; pad[0]=n; return n==0?0:1+f(n-1); }\nint main(){ printf("%d\\n", f(500000)); }');
    expect(r.stdout).toBe('500000\n');
  });

  it('C++: an uncaught exception names the exception', async () => {
    const [r] = await run(CodeLanguage.CPP, '#include <vector>\nint main(){ std::vector<int> v(3); return v.at(10); }');
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.error).toMatchObject({ kind: CodeErrorKind.INDEX });
    expect(r.error?.message).toContain('std::out_of_range');
  });

  it('Java: an exception has its kind and line in Main.java', async () => {
    const [r] = await run(CodeLanguage.JAVA, 'public class Main {\n  public static void main(String[] a){\n    int[] x = new int[2];\n    System.out.println(x[5]);\n  }\n}');
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.error).toMatchObject({ kind: CodeErrorKind.INDEX, line: 4 });
  });

  it('Java: a class not named Main explains the rule', async () => {
    const [r] = await run(CodeLanguage.JAVA, 'class Solution { public static void main(String[] a){ System.out.println(1); } }');
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.error?.message).toMatch(/public class Main/);
  });

  describe('abuse (compiled code)', () => {
    it('C: a raw ptrace system call is blocked', async () => {
      const [r] = await run(CodeLanguage.C, '#include <sys/syscall.h>\n#include <unistd.h>\n#include <stdio.h>\nint main(){ printf("before\\n"); fflush(stdout); syscall(SYS_ptrace, 0, 0, 0, 0); printf("after\\n"); }');
      expect(r.error).toMatchObject({ kind: CodeErrorKind.BLOCKED_SYSCALL });
      expect(r.stdout).toBe('before\n');
    });

    it('C: unshare into a new user namespace is blocked', async () => {
      const [r] = await run(CodeLanguage.C, '#define _GNU_SOURCE\n#include <sched.h>\nint main(){ return unshare(CLONE_NEWUSER); }');
      expect(r.error).toMatchObject({ kind: CodeErrorKind.BLOCKED_SYSCALL });
    });

    it('C: cannot read the harness environment for the code or secrets', async () => {
      const [r] = await run(CodeLanguage.C, '#include <stdio.h>\nint main(){ FILE*f=fopen("/proc/1/environ","r"); int c; while(f&&(c=fgetc(f))!=EOF) putchar(c?c:\' \'); }');
      expect(r.stdout).not.toMatch(/\bSRC=|HARNESS=|DATABASE|JWT|SECRET/);
    });

    it('compile bomb: #include "/dev/zero" stops as a compile error in bounded time', async () => {
      const t = Date.now();
      const [r] = await run(CodeLanguage.C, '#include "/dev/zero"\nint main(){}');
      expect(r.status).toBe(ExecutionStatus.COMPILATION_ERROR);
      expect(Date.now() - t).toBeLessThan(40_000);
    });

    it('compile bomb: runaway template recursion stops as a compile error', async () => {
      const [r] = await run(
        CodeLanguage.CPP,
        'template<int N> struct F { static const int v = F<N+1>::v; };\nint main(){ return F<0>::v; }',
      );
      expect(r.status).toBe(ExecutionStatus.COMPILATION_ERROR);
    });

    it('a 1 GB static array cannot use more memory than the limit', async () => {
      const [r] = await run(CodeLanguage.C, '#include <string.h>\nstatic char a[1<<30];\nint main(){ memset(a, 1, sizeof a); return a[5]; }', [''], 10_000, 64);
      expect(r.status).not.toBe(ExecutionStatus.OK);
    });

    it('Java: Runtime.exec cannot leave a process behind or reach the network', async () => {
      const t = Date.now();
      const [r] = await run(
        CodeLanguage.JAVA,
        'public class Main { public static void main(String[] a) throws Exception {\n  Runtime.getRuntime().exec(new String[]{"sleep","300"});\n  try { new java.net.Socket("1.1.1.1", 80); System.out.println("connected"); } catch (Exception e) { System.out.println("no network"); }\n} }',
      );
      expect(r.stdout).toBe('no network\n');
      expect(Date.now() - t).toBeLessThan(20_000);
    });
  });
});

/**
 * gVisor (RUNNER_DOCKER_RUNTIME=runsc): a second kernel boundary. Linux runner
 * hosts only; run with RUNNER_GVISOR_TESTS=1 after installing runsc
 * (docs/execution-security.md → Deployment checklist).
 */
const describeGvisor = process.env.RUNNER_DOCKER_TESTS === '1' && process.env.RUNNER_GVISOR_TESTS === '1' ? describe : describe.skip;

describeGvisor('DockerRunnerProvider under gVisor', () => {
  jest.setTimeout(60_000);
  const provider = new DockerRunnerProvider(new ConfigService({ RUNNER_DOCKER_RUNTIME: 'runsc' }));
  const run = (code: string) =>
    provider.runBatch({ language: CodeLanguage.PYTHON, code, inputs: [''], limits: { timeLimitMs: 2000, memoryLimitMb: 128 } });

  it('runs code inside the gVisor kernel', async () => {
    // gVisor reports its own kernel, not the host's.
    const [r] = await run('import os\nprint(open("/proc/version").read())');
    expect(r.status).toBe(ExecutionStatus.OK);
    expect(r.stdout).toMatch(/gVisor|Linux version 4\.4\.0/);
  });

  it('still applies the system-call filter', async () => {
    const [r] = await run('import ctypes\nctypes.CDLL(None).ptrace(0, 0, 0, 0)');
    expect(r.error).toMatchObject({ kind: CodeErrorKind.BLOCKED_SYSCALL });
  });

  it('still contains a fork bomb', async () => {
    const [r] = await run('import os\nwhile True:\n    os.fork()');
    expect(r.status).not.toBe(ExecutionStatus.OK);
  });
});
