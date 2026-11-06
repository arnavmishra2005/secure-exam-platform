# Code-runner sandbox: seccomp profile

Owner: Person B (#19). Background: `docs/execution-security.md`.

- `seccomp.json`: the system-call filter `DockerRunnerProvider` passes to every sandbox container (`--security-opt seccomp=…`, setting `RUNNER_SECCOMP_PROFILE`). The API refuses to start if it is missing.
- `build-seccomp.mjs`: generates `seccomp.json` from Docker's default profile (moby `v28.0.0`), which makes the result at least as strict as Docker's default:
  - it drops rules that only apply with a Linux capability (the sandbox has none);
  - it kills the program on the `DENIED` calls (SIGSYS, reported as *Blocked by the sandbox* and flagged on Monitoring);
  - it allows `socket()` only for `AF_UNIX`.

Regenerate after changing `DENIED`, or when moving to a newer Docker profile:

```bash
node infra/runner/build-seccomp.mjs            # fetches Docker's profile
node infra/runner/build-seccomp.mjs default.json  # or from a local copy
RUNNER_DOCKER_TESTS=1 npm run test:runner --workspace=apps/api
```

The lab-PC runner uses the same `DENIED` list (`apps/exam-client/src/main/runner/seccompFilter.ts`). A test fails if the two lists differ.

Hardened sandbox images are in `../runner-images/`.
