# Code execution: security and capacity

How student code is run, what stops it from doing harm, what was tested, and how much load the current setup can take. Code lives in `apps/api/src/modules/execution/` (sandbox) and `apps/api/src/modules/coding/` (run, submit, grading).

## Execution model (since 2026-10-18)

| Action | Where it runs | Notes |
|---|---|---|
| Run / Run samples (practice) | **The student's lab PC**, inside the exam app (`docs/local-code-runner.md`) | Only the student's own input and the visible sample tests. No marks. |
| Run on the server | Development only by default (`CODING_SERVER_RUN`) | Production fallback can be switched on if local runners fail. |
| Submit | Server, **saves only** (`CODING_GRADING_MODE=DEFERRED`) | Instant; no code runs; the last Submit before the end counts. |
| Grading | Server sandbox, **after each attempt ends** | All tests (sample + hidden), partial marks by weight. |
| Regrading | Server sandbox, after a professor edits a question and clicks Recalculate | Reruns only when tests, limits or comparison changed; marks/weights edits rescale stored results. |

Rationale and how to change each choice: decision log in `person_b_plan.md` (§13). Everything below about the sandbox applies to grading, regrading, admin "Test reference solution" and (when enabled) server runs.

## Summary

- Student code runs only inside a throw-away Docker container: no network, read-only filesystem, non-root user, no Linux capabilities, and limits on memory, CPU, processes, open files and output.
- Expected outputs never enter the container. A program that tampers with the in-container test harness can't learn or fake hidden answers.
- Nine abuse scenarios are contained (fork bomb, memory bombs, endless output, filesystem writes, reading secrets, killing or forging the harness, background processes).
- **The API's access to Docker is root-equivalent on that Docker host.** The ideal is a dedicated runner host with no secrets. The college setup (decision log L6) runs Docker on the API/database machine to save cost: use **rootless Docker** there, and keep the machine dedicated to this system.
- **Capacity:** with grading after the exam, students never wait on the runner. 500 submissions are graded in roughly 3–6 minutes at the measured 1.5–3 runs/s (Docker Desktop on a Mac; a native Linux host is usually faster). See [Capacity](#capacity).

## How a run works

1. The API checks the request: the student owns the attempt, the attempt is in progress and not expired, the question is a coding question in that exam, and the code is at most 10,000 characters (custom input at most 64 KB).
2. `RunLimiterService` admits the request:
   - at most `RUNNER_MAX_CONCURRENCY` containers at once (default 4);
   - the rest wait in a first-in-first-out queue of at most `RUNNER_MAX_QUEUE` (default 100). When the queue is full, the student gets 503 and is asked to try again;
   - one run at a time per student, and at most `RUNNER_RUNS_PER_MINUTE` per student (default 20). Both answer 429.

   The limits count per user id, not per IP, because lab PCs often share one IP address.
3. `DockerRunnerProvider` starts one container per request (`docker run --rm -i`). The student's code and a small Python harness are passed as environment variables and written to `/tmp` inside the container, so no host folder is mounted.
4. The harness runs the program once per test input with a time limit for each, and prints the raw results (exit code, output, time) as JSON.
5. The API compares outputs with the expected answers, assigns verdicts, and computes partial marks by test weight. Students see only verdicts for hidden tests.

End-of-attempt grading (`CodeGradingService`, every 15 s) uses the same sandbox. It shares the container slots but bypasses the per-student limits.
Admins' "Test reference solution" (`POST /question-bank/validate-coding`) also uses the same sandbox and limits, counted against the admin's own user id.

## Sandbox controls

| Control | Flag / mechanism | Stops |
|---|---|---|
| No network | `--network none` | Downloading answers, contacting other students, attacking internal services |
| Read-only root filesystem | `--read-only` | Modifying the image, planting files for later runs |
| Small private scratch space | `--tmpfs /tmp:rw,nosuid,nodev,size=16m` | Filling the disk; setuid tricks |
| Memory cap | `--memory` = problem limit + 64 MB, `--memory-swap` equal | Memory bombs (killed by the kernel and reported as *Memory limit exceeded*) |
| CPU cap | `--cpus 1` | One run starving the host |
| Process cap | `--pids-limit 64` | Fork bombs |
| Open-file cap | `--ulimit nofile=64:64` | File-descriptor exhaustion |
| No privileges | `--cap-drop ALL`, `--security-opt no-new-privileges`, `--user 65534:65534` | Privilege escalation inside the container |
| No shared IPC | `--ipc none` | Shared-memory side channels |
| No logs kept by Docker | `--log-driver none` | Student output piling up on the runner host |
| Time limits | Per test in the harness (kills the whole process group); per container, the API kills it with `docker kill` at a deadline | Infinite loops, sleeping forever |
| Output cap | 64 KB per stream (`RUNNER_OUTPUT_LIMIT_BYTES`) | Endless printing |
| Isolated Python | `python3 -I -B`; the program gets only `PATH`, `HOME`, `LANG` | `PYTHON*` environment tricks; no API secrets reach the program |
| Pinned image | `RUNNER_PYTHON_IMAGE`; pin by digest in production | A changed base image altering behavior mid-term |

**Why the expected outputs stay outside:** the student's program runs as the same user as the harness, so it could in principle interfere with the harness. Because the container only ever holds the inputs, the worst a hostile program can do is break its own result, which then counts as a runtime error against it. It can't see or fake the hidden expected answers.

A sandbox failure (Docker down, image missing) is reported as *Runner error* and never counts against the student:
- Run and Submit return 503 and store nothing.
- End-of-attempt grading postpones that question to the next sweep.

## Abuse tests

`npm run test:runner --workspace=apps/api` runs real containers; Docker and the `python:3.12-slim` image are required. Normal `npm test` runs skip it.

| Scenario | Result |
|---|---|
| Fork bomb (`while True: os.fork()`) | Stopped at the time limit; the next run works normally |
| 1 GB allocation in one go | *Memory limit exceeded* |
| Gradually growing memory | *Memory limit exceeded* |
| Endless `print` | *Output limit exceeded*; output capped at 64 KB |
| Writing to `/etc`, `/usr/local/lib/...`, `/home` | Refused (read-only filesystem) |
| Reading the environment for secrets | Only `PATH`, `HOME`, `LANG`; runs as uid 65534 |
| Killing the harness (`os.kill(os.getppid(), SIGKILL)`) | Harness survives; every input still gets a result |
| Writing a fake result to the harness's output | Ignored; can't produce a passing result |
| Background process left running (`sleep 300`) | Removed with the container; the run returns immediately |
| Network access | Fails (no network) |

The same suite also covers the normal cases: hello world, several inputs, runtime and syntax errors, and per-test timeouts.

## Deployment requirements

1. **Runner host.** Anyone who can call the Docker API controls that machine. Best: a separate machine that runs nothing else and holds no secrets (no database, `.env` or credentials), reached with `DOCKER_HOST` (for example `DOCKER_HOST=ssh://runner@runner-host`). Chosen for now (decision log L6): Docker on the API/database machine, with **rootless Docker** so a sandbox escape doesn't give root on that machine, and with the machine used for nothing else.
2. **Network.** The runner host needs no inbound access except from the API host for Docker. Sandboxes themselves have no network.
3. **Pin the image** by digest (`RUNNER_PYTHON_IMAGE=python:3.12-slim@sha256:…`) and pre-pull it on the runner host. The digest used during development was `a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1`.
4. **Recommended hardening on the runner host:** Docker's user-namespace remapping (`userns-remap`) or rootless Docker, so root inside a container isn't root on the host. Optionally use the gVisor runtime (`--runtime=runsc`) for a second kernel boundary; this needs one extra flag in `DockerRunnerProvider`.
5. **One API instance.** The run limits are kept in the API's memory. With more than one API instance, each would admit its own runs, so limits must move to a shared store (Redis) or a real queue first.

## Capacity

**With deferred grading (the default), this section matters only for how fast results appear after an exam** — students never wait on the runner, Submit is a save, and no submission is turned away. At the measured rates, 500 attempts are graded in about 3–6 minutes after they end, and the question-wise results page shows "Grading in progress" until done. The numbers below were measured with live grading (every request waiting for its result), which is what `CODING_GRADING_MODE=LIVE` would bring back.

Measured on 2026-10-17 with `apps/api/scripts/load-test-runner.ts`: 100 students each start an attempt, then all of them press Run samples at once, then all press Submit at once. The coding question has 3 tests. Environment: a MacBook with Docker Desktop (8 CPUs and 4 GB RAM for the VM), with the API on the same machine in production mode.

| Scenario | Concurrency | Result | Typical wait | Slowest wait | Throughput |
|---|---|---|---|---|---|
| Run samples × 100 | 4 | 100 × 200, all correct | 31 s | 63 s | 1.6 / s |
| Submit × 100 | 4 | 100 × 200, all 100 graded correctly | 38 s | 77 s | 1.3 / s |
| Submit × 100 | 8 | 100 × 200, all correct | 43 s | 67 s | 1.5 / s |

- **No errors and no wrong verdicts under load.** The API stayed responsive: a normal request took 45 ms typically and 0.7 s at worst during the load.
- **The bottleneck is Docker's container start rate, not CPU.** Raw `docker run` on this machine manages about 3 containers per second at most, and takes about 2 s per container one at a time. Our flags are not the cost. Raising concurrency from 4 to 8 barely helped.
- **Rough guide for this setup:** the last student waits about *number of simultaneous submits ÷ 1.5* seconds. For a 30-student lab that's about 20 s; for 100 students it's about 75 s.
- **HTTP timeouts.** Run and Submit wait for their result. A reverse proxy with the common 60 s timeout would cut off the slowest requests when around 90 or more students submit at the same moment.
- **Queue size.** With more than `RUNNER_MAX_CONCURRENCY + RUNNER_MAX_QUEUE` (104 by default) simultaneous requests, the rest get an immediate 503 ("runner busy, try again").

Running the load test (local or scratch environments only; it creates students and signs tokens with the local `JWT_ACCESS_SECRET`):

```bash
cd apps/api
EXAM_ID=<active exam containing the coding question> QUESTION_ID=<coding question id> \
STUDENTS=100 API_URL=http://localhost:3000 npx ts-node scripts/load-test-runner.ts
```

### Options, from cheapest

1. **Measure on the real runner host.** A native Linux Docker host usually starts containers faster than Docker Desktop on macOS. This is the first thing to do before a pilot.
2. **Size the pilot to the measured rate.** Stagger end times, or keep lab sections around 30–40 students.
3. **Keep a few pre-started containers ready** (each used once) to absorb bursts. This helps short spikes, not sustained load.
4. **Make Submit return straight away and let the client poll for the result.** This removes the HTTP-timeout risk and lets the UI show "queued, position N". It needs a small jobs table and a polling endpoint.
5. **Judge0 / isolate behind the existing `ExecutionProvider` interface.** Process-level sandboxes take milliseconds per run instead of seconds. The plan already lists this as the swap path; callers don't change.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `RUNNER_DOCKER_BIN` | `docker` | Docker CLI to call (`DOCKER_HOST` etc. are passed through) |
| `RUNNER_PYTHON_IMAGE` | `python:3.12-slim` | Sandbox image; pin by digest in production |
| `RUNNER_MAX_CONCURRENCY` | 4 | Containers at once |
| `RUNNER_MAX_QUEUE` | 100 | Requests allowed to wait; beyond that 503 |
| `RUNNER_RUNS_PER_MINUTE` | 20 | Per student (Run and Submit together) |
| `RUNNER_OUTPUT_LIMIT_BYTES` | 65536 | Per stream, per test |
| `RUNNER_STARTUP_TIMEOUT_MS` | 10000 | Allowance for container start in the overall deadline |

| `CODING_GRADING_MODE` | `DEFERRED` | `DEFERRED`: Submit saves, grading after the attempt. `LIVE`: Submit grades immediately |
| `CODING_SERVER_RUN` | unset | Run / Run samples on the server: unset = on in development, off in production; `true`/`false` to force |

Each question also sets its own time limit per test (100–10,000 ms, default 2,000) and memory limit (32–512 MB, default 256).

**Note on memory vs time limits:** on a heavily loaded or slow Docker host, a program that allocates a lot of memory can be stopped by the time limit before the kernel's memory killer acts, so it is reported as *Time limit exceeded* instead of *Memory limit exceeded*. It is contained either way and scores 0 for that test.
