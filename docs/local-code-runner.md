# Local code runner (for the Electron exam app)

**Owner of the implementation: Person C.** Person B's coding view (`CodingQuestionView` in `packages/exam-content-ui`) already calls it.

During an exam, "Run" and "Run samples" execute the student's code (Python, C, C++ or Java) on their own lab PC, inside the exam app. Only the custom input the student typed and the sample tests (which the student can see anyway) are ever run locally. Submit and grading happen on the server. See the decision log in `person_b_plan.md`.

## Contract

The types are in `packages/types/src/coding.types.ts`:

```ts
interface LocalRunJob {
  language: 'python' | 'c' | 'cpp' | 'java';
  code: string;            // ≤ 10,000 characters
  inputs: string[];        // run the program once per input, in order
  timeLimitMs: number;     // per input (100–10,000)
  memoryLimitMb: number;   // 32–512
  outputLimitBytes: number; // per stream, per input (65,536)
}

interface ExecutionOutcome {
  status: 'OK' | 'COMPILATION_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED'
        | 'MEMORY_LIMIT_EXCEEDED' | 'OUTPUT_LIMIT_EXCEEDED' | 'INTERNAL_ERROR';
  stdout: string;          // capped at outputLimitBytes
  stderr: string;          // capped at outputLimitBytes
  exitCode: number | null;
  timeMs: number;
}
```

Expose it from the preload script as **`window.desktop.runCode(job): Promise<ExecutionOutcome[]>`**. `desktopLocalRunner()` in `packages/exam-content-ui/src/coding/localRunner.ts` picks it up, and the exam page passes it to the view: `<CodingQuestionView localRunner={desktopLocalRunner()} … />`.

### Rules

- **Exactly one outcome per input**, in order.
- **The student's program failing is a normal outcome**, never a rejection:

  | What happened | Status |
  |---|---|
  | Exit code 0 | `OK` |
  | Non-zero exit (exception, syntax error) | `RUNTIME_ERROR` |
  | Killed at the time limit | `TIME_LIMIT_EXCEEDED` |
  | Killed for memory, or `MemoryError` in stderr | `MEMORY_LIMIT_EXCEEDED` |
  | More output than the cap | `OUTPUT_LIMIT_EXCEEDED` |

  The runner returns raw outcomes and passes stderr and the exit code through unchanged. The exam view classifies them with `classifyOutcome` from `@secure-exam/types`, the same function the server uses: a syntax or indentation error becomes `COMPILATION_ERROR`, and every error gets a kind and line number.

- **Reject the promise only when the runner itself can't work:** Python missing, the sandbox failed to start, and so on. In that case the view falls back to the server if the server allows it (`CODING_SERVER_RUN`); otherwise it tells the student to call the invigilator.
- **Same Python as the grader: 3.12, standard library only.** Otherwise the same code can behave differently locally and when graded.
- **Run `python3 -I -B`** with a minimal environment: `PATH`, `HOME=/tmp`, `LANG=C.UTF-8`.

## Required isolation

The student's code runs on the lab PC itself, and the kiosk can't restrict it, because running it is the point. So it must run in a sandbox:

| Requirement | Why |
|---|---|
| **No network** (`--unshare-net`) | Code must not reach other PCs, phones or the internet to share answers |
| Read-only system, private empty `/tmp` | It must not read or modify the exam app's files, the student's home folder, or other students' data on a shared PC |
| Separate process group, killed at the deadline | Infinite loops, sleeping forever, fork bombs |
| Memory and process limits (a cgroup per run) | Memory bombs, fork bombs, filling RAM through `/tmp` |
| System-call filter | Kernel attack surface (`ptrace`, `mount`, `unshare`, `bpf`, `io_uring`...) |
| Output cap while reading | Endless printing filling memory |
| No access to the exam app's tokens or storage | The access token must not be readable by student code |

### Suggested implementation (Linux)

This uses [bubblewrap](https://github.com/containers/bubblewrap) (`bwrap`, available in most distributions) and `prlimit` (from util-linux), run from the Electron main process with `child_process.spawn`:

```bash
# Per input: write the code once to a fresh temp dir, then for each input:
prlimit --as=$((MEM_MB*1024*1024)) --nofile=64 --fsize=$((16*1024*1024)) -- \
bwrap --unshare-all --die-with-parent --new-session \
      --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind-try /lib64 /lib64 --ro-bind /bin /bin \
      --proc /proc --dev /dev --tmpfs /tmp \
      --ro-bind "$TMPDIR/main.py" /sandbox/main.py \
      --chdir /tmp --clearenv --setenv PATH /usr/bin:/bin --setenv HOME /tmp --setenv LANG C.UTF-8 \
      /usr/bin/python3.12 -I -B /sandbox/main.py
```

- Write the input to the child's stdin, then close it.
- Read stdout and stderr with a byte cap. Once the cap is reached, stop reading and kill the child (`OUTPUT_LIMIT_EXCEEDED`).
- Start a timer for `timeLimitMs`. On expiry, kill the whole process group (`process.kill(-pid, 'SIGKILL')`; spawn with `detached: true`) and report `TIME_LIMIT_EXCEEDED`.
- A `SIGKILL` the runner didn't send, or `MemoryError` in stderr, means `MEMORY_LIMIT_EXCEEDED`.
- Delete the temp dir afterwards.

The flags are a starting point. Verify them on the lab image, especially which `/lib*` paths exist and whether unprivileged user namespaces are enabled for `bwrap`.

### C, C++ and Java (#16)

`localRunner.ts` compiles once per Run, then runs each input. Flags, time factors and memory overheads match the server's `language.registry.ts`.

| Language | Compile (writable job folder at `/work`) | Run (job folder read-only at `/sandbox`) |
|---|---|---|
| C | `gcc -std=gnu17 -O2 -pipe -fmax-errors=5 -o /work/main /work/main.c -lm`, 10 s, 512 MB | `/sandbox/main`, 64 MB stack |
| C++ | `g++ -std=gnu++17 …` (same) | same |
| Java | `javac -J-Xmx256m … -d /work /work/Main.java`, 15 s | `java -Xmx<limit>m -Xss64m -XX:+UseSerialGC … -cp /sandbox Main`, twice the time limit, up to 128 threads, no `prlimit --as` (the JVM reserves far more address space than it uses; the cgroup caps real memory) |

- **Compile errors:** a compile failure gives every input `COMPILATION_ERROR`, with the compiler's output in `stderr`. The exam view labels it with the first error's line.
- **Same sandbox:** the compiler runs inside the same sandbox (cgroup, system-call filter, no network), because it also reads untrusted input.
- **Where the compilers come from:** the lab image (`gcc`, `g++`, `default-jdk-headless`; see `setup-exam-kiosk.sh`). Ubuntu's JDK keeps its configuration in `/etc/java-*`, which is mounted read-only.
- **A missing compiler** rejects the run, and the view shows its fallback message.

### Hardening added in #19

The implementation (`apps/exam-client/src/main/runner/localRunner.ts`) wraps each run like this:

```bash
systemd-run --user --scope --quiet --collect \
    -p TasksMax=64 -p MemoryMax=$((MEM_MB+64))M -p MemorySwapMax=0 -p CPUQuota=100% -- \
  prlimit --as=… --nofile=64 --fsize=16777216 -- \
  bwrap … [--size 16777216] --tmpfs /tmp … --seccomp 3 /usr/bin/python3 -I -B /sandbox/main.py
```

- **cgroup per run** (`systemd-run --user --scope`): at most 64 processes and threads, so a fork bomb can't exhaust the PC. The memory cap also counts `/tmp`, because tmpfs pages are charged to the cgroup. It needs the user session's systemd with the `pids memory cpu` controllers delegated (`infra/linux-kiosk/setup-exam-kiosk.sh` adds the drop-in).
- **System-call filter** (`seccompFilter.ts`): a BPF program generated in TypeScript and passed to bwrap on fd 3. It uses the same deny list as the server (`infra/runner/build-seccomp.mjs`): denied calls kill the program (exit 159, shown as *Blocked by the sandbox*), sockets other than `AF_UNIX` and `clone` with namespace flags fail with EPERM, and any other architecture or ABI is killed. It covers x86-64 and arm64.
- **`/tmp` size cap** with `bwrap --size` where bubblewrap is 0.10 or newer. Ubuntu 22.04 and 24.04 ship older versions; there the cgroup memory cap bounds it.
- **Required tools:** `bwrap`, `prlimit`, `systemd-run`. If one is missing, runs are refused; there is no weaker fallback.
- **Self-test** (`checkSandbox()`, started when the app starts on Linux, and before the first run). It checks three things: the cgroup limits really apply, a test program prints `42`, and `ptrace` is killed. If any check fails, every Run is refused with "The code sandbox does not work on this computer (…). Tell the invigilator." Submit still works, because grading runs on the server.
- **Ubuntu 24.04+** blocks unprivileged user namespaces through AppArmor. The kiosk setup adds a profile that allows them for `/usr/bin/bwrap` only.
- **Unsandboxed mode** remains development-only (`IS_DEV && EXAM_UNSANDBOXED_RUNNER=1`).

> **Do not use `prlimit --nproc`.** `RLIMIT_NPROC` counts every thread the user owns, and Electron alone has hundreds, so the sandbox could not even start. Fork bombs are contained by `bwrap --unshare-all` (own PID namespace, killed with the process group at the deadline). The implementation is `apps/exam-client/src/main/runner/localRunner.ts`.

### Lab image

- `python3.12` and `bubblewrap` installed.
- The kiosk's network allowlist (C's `nftables` rules) still applies. The runner's `--unshare-net` is in addition to it.

## Acceptance checklist

Run these inside the exam app on a lab PC. Each must produce the stated status, and the exam app must keep working.

| Program | Expected |
|---|---|
| `print(int(input()) * 2)` with input `21` | `OK`, stdout `42\n` |
| `raise ValueError("x")` | `RUNTIME_ERROR`, traceback in stderr |
| `while True: pass` (limit 1000 ms) | `TIME_LIMIT_EXCEEDED` after about 1 s |
| `x = bytearray(2 * 1024**3)` | `MEMORY_LIMIT_EXCEEDED` |
| `import os`<br>`while True: os.fork()` | Not `OK`; the PC stays responsive (at most 64 processes) |
| C: `int main(){ int x = undeclared; }` | `COMPILATION_ERROR` on every input, line 1 |
| C++: `cin >> a >> b; cout << a + b;` with `40 2` | `OK`, `42` |
| Java: `public class Main` printing `s.nextLong() + s.nextLong()` with `40 2` | `OK`, `42` |
| C: `syscall(SYS_ptrace, 0, 0, 0, 0)` | Exit 159, *Blocked by the sandbox* |
| `import ctypes; ctypes.CDLL(None).ptrace(0,0,0,0)` | `RUNTIME_ERROR`, exit 159, shown as *Blocked by the sandbox* |
| `import socket; socket.socket(socket.AF_INET)` | `PermissionError` |
| `f = open("/tmp/x", "wb")`<br>`while True: f.write(b"x" * 10**6)` | Not `OK`; the PC's memory is untouched |
| `bwrap`, `prlimit` or `systemd-run` missing, or the user's systemd not delegating `pids`/`memory` | The self-test fails; Run shows the invigilator message |
| `while True: print("x" * 1000)` | `OUTPUT_LIMIT_EXCEEDED`, stdout ≤ 64 KB |
| `import socket; socket.create_connection(("1.1.1.1", 80), 2)` | `RUNTIME_ERROR` (no network) |
| `print(open("/home/<user>/.bashrc").read())` | `RUNTIME_ERROR` (not visible) |
| `import os; print(sorted(os.environ))` | Only `HOME`, `LANG`, `PATH` |
| `import subprocess; subprocess.Popen(["sleep", "300"]); print("bye")` | `OK`; no `sleep` process left afterwards |
| Python missing | The promise rejects; the view shows its fallback message |

The server's sandbox passes the equivalent suite (`npm run test:runner --workspace=apps/api`). See `docs/execution-security.md`.
