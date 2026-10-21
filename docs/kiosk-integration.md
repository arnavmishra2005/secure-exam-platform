# Kiosk integration: decisions, fixes and follow-ups

Written for Person A, B and C. It records how Person C's `kiosk-work` branch was merged into the
A+B integration (`integrate/a-b`), why, and what is still open. Branch: `integrate/final`.

**Rule used for the merge:** `integrate/a-b` is the reference. C worked against the older legacy
apps, so C's code was adapted to the unified `apps/web`, never the other way round.

## 1. Architecture after the merge

```
Student PC                                        Server
┌───────────────────────────────────────┐        ┌──────────────┐
│ Electron (apps/exam-client/src)       │        │ apps/api     │
│  main: window, guards, IPC, runner    │  HTTP  │  /auth       │
│  preload: window.desktop              │◄──────►│  /health     │
│  ┌─────────────────────────────────┐  │        │  /attempts   │
│  │ apps/web (the only student UI)  │  │        │  ...         │
│  │ dev:  http://localhost:3003     │  │        └──────────────┘
│  │ prod: app://exam  (built dist)  │  │   X-Client-Type: DESKTOP is added by
│  └─────────────────────────────────┘  │   Electron on every API request
└───────────────────────────────────────┘
```

- `apps/exam-client/src` is C's Electron shell. It loads `apps/web`.
- `apps/exam-client/renderer` and `apps/admin-web` are legacy and untouched by the kiosk work.
- The Electron shell is a thin wrapper. All exam UI stays in `apps/web`, so there is one UI to maintain.
- `window.desktop` is the only bridge between the web app and the shell. Its type is `DesktopBridge`
  in `packages/types/src/client-security.types.ts`. In a plain browser it does not exist, and every
  helper in `apps/web/src/features/exam-taking/desktop/desktop.ts` is a no-op.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Electron loads `apps/web`, not the legacy renderer | `apps/web` has the dashboard, exam taking, monitoring and B's coding view. The legacy renderer lacks them. The 9-day plan says the same. |
| 2 | Kiosk UI ported into `apps/web/src/features/exam-taking/desktop/`, restyled with the UI kit | One UI. `ReadinessGate` is on the instructions page, `ViolationBanner` is in `ExamLayout` only, so it never shows on admin or dashboard pages. |
| 3 | The window starts as a normal window. Lockdown starts only when an exam is in progress | The old code locked the whole app at launch, so even admins and the login screen were in kiosk mode. Lockdown is `SET_SECURITY_MODE(true)`, sent by `ExamPage` when an attempt is `IN_PROGRESS`. |
| 4 | Every guard keys off `isSecurityActive()` alone (input, focus, display, context menu, close) | The old `NODE_ENV === 'production' \|\| isSecurityActive()` made the guards always on in production. |
| 5 | Dev mode is `!app.isPackaged` (`main/config.ts`) | A packaged Electron app does not set `NODE_ENV`, so it was treated as dev (DevTools on, loads `localhost`). |
| 6 | Production serves the built `apps/web` from a custom `app://exam` scheme | `apps/web` uses a browser router, which breaks from `file://`. A real origin also keeps IndexedDB and Monaco's workers working. The handler serves only files inside the build directory and falls back to `index.html`. |
| 7 | Administrators are refused in the exam app, on the server | `POST /auth/login` and `/auth/refresh` return 403 for `role=admin` with `X-Client-Type: DESKTOP`, checked before any token is issued, and audit-logged as `LOGIN_FAILED` (`admin_on_desktop`). `ALLOW_ADMIN_ON_DESKTOP=true` lifts it for development. Enforcing it on the server means a client bug cannot let an admin into the kiosk. |
| 8 | Electron adds `X-Client-Type: DESKTOP` itself (`session.webRequest`) | Web code cannot forget it. The header is advisory: someone in a browser can send it, but that only restricts themselves. |
| 9 | C's role-selection login, admin redirect page and SSO token-in-URL handoff were dropped | `apps/web` already has one login that routes by role. Passing a refresh token in a URL leaks it to history and logs. |
| 10 | Local code runner: `window.desktop.runCode`, bubblewrap on Linux | Contract in `docs/local-code-runner.md`. The student's code is untrusted, so: no network, read-only system, private `/tmp`, scrubbed environment, memory cap, process group killed at the deadline. |
| 11 | `prlimit --nproc` is not used | `RLIMIT_NPROC` counts every thread the user owns. Electron has hundreds, so the sandbox would not start. `bwrap --unshare-all` and killing the group cover fork bombs. |
| 12 | Runner without bubblewrap rejects, unless `EXAM_UNSANDBOXED_RUNNER=1` in dev | Fail closed. Never run student code unsandboxed in production. The view falls back to the server or tells the student to call the invigilator. |
| 13 | Blocked paste becomes the violation `CLIPBOARD_BLOCKED` | It goes through the same path as C's other violations, so it reaches the audit log once the events endpoint exists. |
| 14 | `window.desktop` typed once, in `packages/types` | Two `declare global` blocks with different types for `Window.desktop` do not compile. `exam-content-ui` now uses the shared `DesktopBridge`. |
| 15 | Invigilator exit PIN has no default outside dev | The old default `1234` shipped in production. Without `INVIGILATOR_PIN`, nobody can exit mid-exam except by submitting. |
| 16 | Added a public, unthrottled `GET /health` | C's readiness check pings it. It always reported "server unreachable" before. |
| 17 | Merge via a new branch `integrate/final`, not into `main` directly | `integrate/a-b` stays intact as the reference. |

## 3. Bugs found and fixed during the merge

1. **Admin (and login screen) in kiosk mode:** see decisions 3, 4, 5.
2. **"Submitted" flag never reset.** After the first exam in an app session, `isExamSubmitted` stayed true, so a second exam started without lockdown. Now reset on `SET_SECURITY_MODE(true)`.
3. **Runner waited out the time limit** when a program left a background process holding the output pipes. It now finishes on process exit, waits briefly for buffered output, and kills the whole process group.
4. **Default exit PIN in production:** see decision 15.
5. **`/health` missing:** see decision 16.
6. **Doc recipe flaw:** `prlimit --nproc=64` in `docs/local-code-runner.md`: see decision 11.
7. **Noise events:** focus-lost, display-change and shortcut events were emitted on every screen, including the dashboard. They now fire only during an exam.

## 4. Not verified

- Kiosk lockdown (Linux session, nftables, shortcut blocking, forced refocus) and the `infra/linux-kiosk` scripts.
- Monaco inside Electron (workers under `app://`), and drag-resize of the coding panes.
- The bubblewrap command line on a real Linux lab image (which `/lib*` paths exist, unprivileged user namespaces).
- `npm run desktop:build` (electron-builder) and the packaged `app://exam` path. Only the dev path was started, for 15 seconds on macOS, with no errors.
- A full browser click-through: admin creates a coding question and exam, student solves, server grades, results show marks.

## 5. Follow-ups and improvements

### Needs the backend (A / C)
- **Security events endpoint** (`POST /attempts/:id/events`). Today violations are only shown in the banner and logged to the Electron console (`logViolation` in `ipc/channels.ts` has a "persist to backend" TODO), and `violationCount` in results and monitoring is always null.
- **Agree on one event vocabulary.** C's `ViolationType` (`NAV_BLOCKED`, `DEVTOOLS_ATTEMPT`, `CLIPBOARD_BLOCKED`, `KIOSK_CHECK_FAILED`) differs from the `SecurityEventType` enum in `packages/types` (`BLOCKED_NAVIGATION`, `READINESS_FAILED`). Pick one before the endpoint is built.
- **Policy gate:** enforce `requireDesktopClient` and `minClientVersion` when an attempt starts, using the `X-Client-Type` header, plus a client version header. The exam app should refuse to start the exam when the API rejects its version.
- **Device sessions:** one active session per student (`DeviceSession` in the contract types).
- **Server-controlled exit PIN:** fetch it from an exam policy instead of an environment variable.

### Electron app (C)
- `exitPolicy.test.mjs` tests a copy of the logic, not the real handler. Extract the policy into a pure function and import it.
- The readiness check treats any HTTP response from `/health` (even 500) as reachable, and its 5-second timer is never cleared.
- `platform/` only has Linux (`linux.ts`). Add a Windows implementation if the labs run Windows (see `9_day_plan_windows_linux_kiosk.md`).
- The forbidden-process list is a fixed array. Make it configurable from policy.
- `HEARTBEAT_LOST` is an allowed violation type, but nothing raises it yet. Raise it from the web app's heartbeat failures (`useServerClock`) through `logViolation`.
- Decide what happens if the renderer crashes mid-exam (reload the page and resume the attempt, and log it). Not checked.
- Packaging: confirm `extraResources` copies `apps/web/dist` to `resources/web`, and test an installer on a clean lab image. Add code signing later.

### Runner (B / C)
- Add the acceptance checklist in `docs/local-code-runner.md` as an automated Linux CI test (fork bomb, memory bomb, network, filesystem, environment).
- The cap is address space (`prlimit --as`). Python can fail to start with very small budgets. A cgroup memory limit is stronger if the lab image allows it.
- Add a small unit test suite for `runner/localRunner.ts` (the manual test used the unsandboxed dev mode).
- Cap total CPU time per exam so repeated Run clicks cannot slow the PC.

### Web app (A / B)
- A unit test for `ReadinessGate`, `ViolationBanner` and `SubmittedPage`'s unlock behaviour with a fake `window.desktop`.
- Show a clear message on the login page when the server refuses an admin in the exam app. It already shows the server message; consider a dedicated "Open the admin portal in a browser" screen.
- If the student reloads the page mid-exam, `ExamPage` re-locks once the attempt loads. Check there is no unlocked flash.
- Run `ViolationBanner` events into the audit log as soon as the endpoint exists.

### Repo hygiene
- Delete the unused `ResultTableScoreSink` (`apps/api/src/modules/coding/score-sink/`).
- Delete the legacy `apps/exam-client/renderer` and `apps/admin-web` once everyone agrees `apps/web` is complete. The legacy `client:*` scripts and tests then go too.
- `docker compose up --build` still has the known problems listed in `CLAUDE.md` (API Dockerfile does not build `packages/*`).
- The `docker-compose.yml` change from C (a `DATABASE_URL` override for the API container) is harmless for the local Postgres-only workflow.
- C's `seed.ts` change resets seeded users' passwords on every seed run. Fine for dev; do not run the seed against shared data.

## 6. Running it

```bash
npm install && npm run typecheck
docker compose up -d postgres && npm run migration:run && npm run db:seed
npm run api:start                 # apps/api/.env: CORS_ORIGIN must include app://exam for packaged builds
npm run client:desktop            # compiles Electron, starts apps/web on :3003 and opens the app
# no bubblewrap on your machine? for development only:
EXAM_UNSANDBOXED_RUNNER=1 npm run client:desktop
# test an admin in the exam app (dev only): ALLOW_ADMIN_ON_DESKTOP=true in apps/api/.env
```

Environment variables added: `ALLOW_ADMIN_ON_DESKTOP` (api, default false), `EXAM_API_URL`,
`EXAM_WEB_URL`, `INVIGILATOR_PIN`, `EXAM_UNSANDBOXED_RUNNER` (Electron).
