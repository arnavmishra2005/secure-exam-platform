# Local code runner (for the Electron exam app)

**Owner of the implementation: Person C.** Person B's coding view (`CodingQuestionView` in `packages/exam-content-ui`) already calls it.

During an exam, "Run" and "Run samples" execute the student's Python on their own lab PC, inside the exam app. Only the custom input the student typed and the sample tests (which the student can see anyway) are ever run locally. Submit and grading happen on the server. See the decision log in `person_b_plan.md`.

## Contract

The types are in `packages/types/src/coding.types.ts`:

```ts
interface LocalRunJob {
  language: 'python';
  code: string;            // ≤ 10,000 characters
  inputs: string[];        // run the program once per input, in order
  timeLimitMs: number;     // per input (100–10,000)
  memoryLimitMb: number;   // 32–512
  outputLimitBytes: number; // per stream, per input (65,536)
}

interface ExecutionOutcome {
  status: 'OK' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED' | 'MEMORY_LIMIT_EXCEEDED'
        | 'OUTPUT_LIMIT_EXCEEDED' | 'INTERNAL_ERROR';
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
| Memory and process limits | Memory bombs, fork bombs |
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
| `import os`<br>`while True: os.fork()` | Not `OK`; the PC stays responsive |
| `while True: print("x" * 1000)` | `OUTPUT_LIMIT_EXCEEDED`, stdout ≤ 64 KB |
| `import socket; socket.create_connection(("1.1.1.1", 80), 2)` | `RUNTIME_ERROR` (no network) |
| `print(open("/home/<user>/.bashrc").read())` | `RUNTIME_ERROR` (not visible) |
| `import os; print(sorted(os.environ))` | Only `HOME`, `LANG`, `PATH` |
| `import subprocess; subprocess.Popen(["sleep", "300"]); print("bye")` | `OK`; no `sleep` process left afterwards |
| Python missing | The promise rejects; the view shows its fallback message |

The server's sandbox passes the equivalent suite (`npm run test:runner --workspace=apps/api`). See `docs/execution-security.md`.
