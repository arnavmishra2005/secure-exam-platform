# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is Phases 1–2 of a secure exam platform, set up as an npm-workspaces monorepo:

- `apps/api`: NestJS API
- `apps/web`: the Vite + React website for instructors, TAs (under `/instructor`) and students (`/student`), port 3003. Old `/admin/...` links redirect to `/instructor/...`. (The Next.js `apps/admin-web` was removed in Phase 5.)
- `apps/exam-client/renderer`: legacy Vite + React student exam UI (Phase 2, port 3002). Superseded by `apps/web`.
- `apps/exam-client` (its `src/`): Person C's Electron exam app. It loads `apps/web` (dev: `http://localhost:3003`; packaged: the built `apps/web` served from `app://exam`). The window starts as a normal window and locks down only while a student has an exam in progress (`window.desktop.setSecurityMode`). Run it with `npm run client:desktop`. Sends `X-Client-Type: DESKTOP` on API requests, and the API refuses instructor and TA login/refresh from it (`ALLOW_STAFF_ON_DESKTOP=true` lifts that for development). `window.desktop.runCode` runs student Python in a bubblewrap sandbox; set `EXAM_UNSANDBOXED_RUNNER=1` to run without one on a dev machine that lacks it (not a sandbox). Add `app://exam` to `CORS_ORIGIN` for packaged builds. **The app is an exam launcher, like Safe Exam Browser:** a student signs in on the browser, presses Start exam, and the browser opens `secure-exam://launch/<one-time token>` (`POST /auth/exam-launch`; the password never leaves the browser). The app shows the student's email and a masked password (read-only), Login redeems the token (`/auth/exam-launch/redeem`), and the exam starts; afterwards only an "exam submitted" screen with Close (auto-closes in 30 s) remains, and the app wipes its storage. In development run `npm run exam:register` once (`scripts/register-exam-protocol.mjs`): it registers a launcher for `secure-exam://` links (macOS: `~/Applications/SecureExamDev.app`; Ubuntu: a `.desktop` file plus `xdg-mime`), so the browser button opens the app from source. The app registers itself only when packaged. `EXAM_LAUNCH_LINK` and `npm run exam:app` remain as fallbacks. **Exams are exam-app-only:** the API refuses to start an attempt, serve its questions, save answers or submit unless the request carries `X-Client-Type: DESKTOP` (`DesktopClientGuard`; `REQUIRE_DESKTOP_CLIENT=false` switches it off for development, with `VITE_REQUIRE_DESKTOP_EXAM=false` in `apps/web`). The dashboard, results and staff pages work in a browser, which opens the app with a `secure-exam://exam/<id>` link. During an exam the app blocks reload/quit/DevTools/etc. (`main/keyPolicy.ts`, macOS and Ubuntu) and reports violations to `POST /attempts/:id/events` (table `security_events`, module `client-security`); staff with MONITOR see them on Monitoring and Results. Details and open items: `docs/kiosk-integration.md`.
- `packages/*`: shared TypeScript packages

Kiosk and Electron lockdown are planned for later phases.

**Current work (Phase 4):** the next iteration is planned in `phase4_improvements_electron_kiosk_codeeditor_plan.md` (design) and `9_day_plan_windows_linux_kiosk.md` (schedule). This checkout's user is **Person B** (question bank, Python code editor + runner, question-wise results); B's own plan is `person_b_plan.md`. Stay inside B's folders and list anything needed from A or C as an ask.

The design and module ownership are described in `phase1_backend_admin_security_task_breakdown.md`, `phase1_file_structure_and_ownership.md` and, for the exam client, `phase2_3_frontend_persistence_plan.md`. Some things those documents plan were never built: a root `database/` folder, a CI workflow, and a root `.env.example`. `secure_exam_system_implementation_plan.md` is empty.

## Commands

Run everything from the repo root:

```bash
cp apps/api/.env.example apps/api/.env
npm install
npm run typecheck              # builds packages/* into dist/ — required before anything else (see below)
docker compose up -d postgres  # Postgres 16 on :5432
npm run migration:run
npm run db:seed                # optional dev data; see below
npm run db:seed-instructors    # instructors only (or: -- instructors.json)
npm run api:start              # http://localhost:3000, Swagger UI at /api/docs
npm run web:dev                # website, http://localhost:3003
```

- **Tests:** `npm run api:test` (Jest), `npm run web:test` (Vitest, website) and `npm run client:test` (Vitest, legacy exam client).
  - One file: `npm test --workspace=apps/api -- timer.service`
  - One test: `npm test --workspace=apps/api -- -t "rejects a second attempt"`
- **Lint:** `npm run api:lint`.
- **Type-check without building:** `npx tsc --noEmit -p apps/api`, `npm run web:typecheck` and `npm run client:typecheck`.
- **Full builds:** `npm run api:build`, `npm run web:build` and `npm run client:build`.
- **Migrations:** `npm run migration:run` and `npm run migration:revert`. To generate one: `npm run migration:generate --workspace=apps/api -- src/database/migrations/<Name>`.

Things the scripts don't make obvious:

- **Shared packages are loaded from `dist/`.** Each package's `main` is `dist/index.js`, and there are no path aliases or Jest mappers. Run `npm run typecheck` on a fresh checkout and after any change under `packages/`. Despite its name, the script writes `dist/`. Until it runs, the API, its tests, and the migration CLI can't resolve `@secure-exam/*` and won't see your changes.
- API scripts must run with `apps/api` as the working directory, because `.env` loading and the migrations glob use relative paths. The workspace scripts already do this.
- API tests live in `apps/api` (`src/**/*.spec.ts`). They are unit tests with mocked repositories and a mocked `DataSource`, so they need no database. One spec comment mentions a `test/integration/...` file that doesn't exist. Exam-client tests are `apps/exam-client/renderer/src/**/__tests__/*.test.ts`; they fake the API and use `fake-indexeddb`.
- **Dev seed:** `npm run db:seed` (`apps/api/src/database/seed.ts`) creates instructors `instructor@`, `instructor2@`, `instructor3@secure-exam.dev` / `Instructor@1234` (the first teaches CS201 and owns the sample exam; the second owns CS301 and a draft exam, to check isolation), a TA `ta@secure-exam.dev` / `Assistant@1234` on CS201 (EXAM_VIEW, MONITOR, RESULTS_VIEW), three students (`alice@`, `bob@`, `carol@secure-exam.dev` / `Student@1234`) and an ACTIVE exam `11111111-1111-4111-8111-111111111111` with five multiple-choice questions and one medium coding question ("Merge Intervals", 10 marks, 2 sample + 8 hidden test cases; data in `apps/api/src/database/seed-data/merge-intervals.ts`). The coding question is added by its own idempotent step, so re-running the seed also adds it to an exam that already has the five. It also puts six easy coding questions (5 marks each, topic "Python basics", tags `sample`/`easy`; data and spec in `apps/api/src/database/seed-data/easy-coding*.ts`) in the question bank, not linked to any exam, in `instructor@`'s bank, for adding to new exams. Server-side grading of code needs Docker and the `python:3.12-slim` image. It is idempotent and refreshes the exam window on each run. Outside production it first turns any old `admin` users into instructors (the migration's SQL; synchronize can't), deactivates the old `admin@secure-exam.dev`, and synchronizes the schema the way the dev API does (see Database). Seeded assignments store `users.id`.
- **There is no admin, and the API can't create an instructor.** Instructors come from `npm run db:seed-instructors` (`src/database/seed-instructors.ts`; with a JSON file `[{ "email", "fullName", "password" }]`, required in production; existing accounts are left alone). Instructors create courses and add TAs (`POST /courses/:id/staff`, which creates a TA account for a new email). Students are created inside a course (`POST /courses/:id/students/create|import`). Passwords must be at least 8 characters (`LoginDto`). A student created without an explicit `password` gets a random one that is never returned.

## Architecture

### Layout
- `apps/exam-client/renderer`: Vite 8 + React 18 student UI (React Router, React Query, Zustand, Tailwind).
  - Routes: `/login` → `/instructions` (enter an exam ID, `POST /attempts`) → `/exam` → `/submitted`. The attempt ID lives in `sessionStorage`; when it's lost, starting again gets a 409 and the page resumes the in-progress attempt through `GET /attempts/current?examId=` (student only, own attempt). The exam ID `demo` starts a local-only fixture attempt with sample questions.
  - `persistence/` is Person C's framework-agnostic offline layer: `IOfflineStore` (IndexedDB now, in-memory fallback, SQLite in Phase 4), a sync engine that pushes pending answers one at a time with backoff, then a queued submit, and a network monitor (`navigator.onLine` plus a heartbeat ping). UI code saves answers only through `saveAnswer()` (B's `useAnswer`) and submits only through `requestSubmit()`. It reads sync state through `useSyncStatus` and `useNetworkStatus`.
  - `vite.config.ts` aliases `@secure-exam/types` and `@secure-exam/api-client` to their TypeScript source, so the renderer doesn't need `dist/`. `main.tsx` calls `setBaseURL(VITE_API_BASE_URL)`.
- `apps/api`: NestJS 10 with TypeORM 0.3 on Postgres. Each domain has a folder under `src/modules/` (auth, user, audit, exam, question, attempt, answer). Cross-cutting guards, decorators, filters, the interceptor, and config live in `src/common/`.
- `apps/web`: Vite + React 18 with React Router and React Query. `RequireRole` guards `/instructor` (instructors and TAs) and `/student` on the client only. `auth/useAccess.ts` reads `GET /me/access` to show only the menus (`app/registry/nav.ts`) and buttons the user's course permissions allow; the API enforces them regardless.
- `packages/types`: interfaces and enums used by both apps, plus a few shared constants such as `EXAM_STATUS_TRANSITIONS`.
- `packages/validation`: class-validator DTO classes. API controllers use them directly as `@Body()` and `@Query()` types. The `dto/index.ts` files inside modules only re-export them.
- `packages/api-client`: thin axios wrappers that share a single in-memory access token, set with `setAccessToken()`.

Many comments mention "Person A/B/C". These refer to the ownership split in the planning docs:
- A: auth, users, audit, security
- B: exams, questions
- C: attempts, answers, submissions, monitoring

The shared barrels (`packages/*/src/index.ts`) and `app.module.ts` are meant to receive only small, additive edits.

### API request pipeline
`main.ts` and `app.module.ts` register these globally:
- Helmet
- CORS, allowing the comma-separated origins in `CORS_ORIGIN` (website and exam app)
- `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform`
- `HttpExceptionFilter`, which never sends stack traces to clients
- Four `APP_GUARD`s that run in this order: `ThrottlerGuard`, `JwtAuthGuard`, `RolesGuard`, `PermissionGuard`

Rules that follow from this:
- Every route requires a JWT unless it is marked `@Public()`. Only login and refresh are public. Login is limited to 5 requests per minute and refresh to 10.
- A route without `@Roles()` is open to **any** logged-in user, including students. Always declare roles. Because the guards are global, the `@UseGuards(JwtAuthGuard, RolesGuard)` on some controllers is redundant.
- **Roles are `instructor`, `ta` and `student`; there is no admin.** Staff access is per course (`course_staff`: each course's INSTRUCTORs may do everything on it, TAs only their `permissions`, from the `Permission` enum in `packages/types/src/access.types.ts`). `common/access/`:
  - `@RequirePermission(Permission.X, { exam: 'examId' })` (also `course`, `attempt`, `question`, `topic`, `student`) makes a route staff-only and checks the permission on the course that owns the record in that route parameter. `@RequireCourseStaff({ course: 'id' }, { instructorOnly })` checks membership or instructorship. `@StaffAccess(...)` adds the check without restricting roles, for routes students use too. A class-level rule applies to every method without its own, so a method without the named parameter needs its own decorator.
  - Not on the course's staff: **404**; on it without the permission: 403. Without a named record, the guard lets instructors through and requires the permission somewhere for TAs.
  - **Lists must be scoped in the handler**: pass `AccessService.courseIdsFor(user, perm)`, `examIdsFor(...)` or `bankOwnerIdsFor(...)` to the service. Records named in a body (e.g. `courseId` on `POST /exams`) are checked with `access.assertCourse/assertExam/assertQuestion`.
  - Every exam has an owning course (`exams.course_id`); every question and topic belongs to one instructor's bank (`owner_id`), visible to their TAs with QUESTION_BANK_* on one of their courses. `AccessService.resolveBankOwner` picks the bank for new items.
  - `GET /me/access` lists the caller's courses and permissions.
- Use `@CurrentUser()` from `common/decorators`. It returns a `JwtPayload` whose `sub` is the `users.id`. Nothing uses `modules/attempt/decorators/current-user.decorator.ts` or the `mock-*-lookup.service.ts` files. They are leftover stand-ins.
- Joi validates environment variables when the app starts (`common/config/env.validation.ts`). Add new variables there.
- There is no global route prefix. The routes are `/auth`, `/health`, `/me/access`, `/courses` (incl. `/courses/:id/staff`), `/attempts/:attemptId/events`, `/students`, `/exams`, `/questions`, `/exams/:examId/questions`, `/attempts`, `/attempts/:attemptId/answers`, `/attempts/:attemptId/questions`, `/submissions` and `/audit`.

### Auth
- Access and refresh JWTs are signed with separate secrets.
- `users.refreshTokenHash` stores a bcrypt hash of the most recently issued refresh token. Logout clears it.
- On every request, `JwtStrategy` checks that the user still exists and is active.
- The website keeps the access token in memory and the refresh token in `localStorage`. It refreshes the access token only when a page loads, because there is no interceptor that refreshes after a 401. A tab left open longer than `JWT_ACCESS_EXPIRES_IN` (15 minutes by default) starts getting 401 errors.
- The exam client stores tokens the same way, but refreshes on a 14-minute timer, and also when the sync engine reports a 401 (`handleUnauthorized` in `AuthContext`).

### Exam → attempt → result lifecycle
- **Exams** move through `DRAFT → SCHEDULED → ACTIVE → CLOSED`, only forward, as defined by `EXAM_STATUS_TRANSITIONS`.
  - Each step is a manual call by staff with EXAM_EDIT (`POST /exams/:id/schedule|start|close`). Nothing changes automatically when `startTime` arrives.
  - Timing can be edited with `PATCH`, and an exam deleted, only while it is in DRAFT. Afterwards `POST /exams/:id/reschedule` moves it: any change before anyone has started, only a later `endTime` after; never when CLOSED. The first start-time move of a published exam keeps `original_start_time`, and the student dashboard shows "Delayed by …" and the `schedule_note`; registered students are notified.
  - `pass_mark_enabled = false`: no pass/fail, and a null pass rate, in results and on the student dashboard.
- **Attempts:** a student gets one attempt per exam, enforced by the `UQ_attempts_exam_student` constraint.
  - An attempt can start only while the exam is ACTIVE and the current time is between `startTime` and `endTime`.
  - `TimerService` sets `expiresAt` to the earlier of `start + durationMinutes` and `exam.endTime`.
  - Only the server clock decides. Times sent by the client are informational.
  - Closing an exam does not end or block attempts already in progress. They run until their own `expiresAt`.
- **Finalization** (`IN_PROGRESS → SUBMITTED | AUTO_SUBMITTED`) writes a `Submission` and an unpublished `Result`. An expired attempt is auto-submitted in two ways:
  - when the next answer save or submit arrives for it
  - by a cron sweep every 30 seconds (`AttemptExpirySweepService`)
- **Scoring:** an objective question earns marks only when the selected options exactly match the correct set. There is no partial credit. `negativeMarks` is stored but not applied. Staff with MARKS_ADJUST can override a score (up to `maxScore`); RESULTS_PUBLISH publishes or unpublishes results.

### Invariants to preserve
- **Locking attempt writes.** Every answer write and every finalization goes through `SubmissionService.withLockedInProgressAttempt`.
  - The method opens a transaction, locks the attempt row with `SELECT … FOR UPDATE`, and re-checks that the status is still `IN_PROGRESS`.
  - Write through the `EntityManager` it passes in, never through injected repositories.
  - This is what turns a save racing a submit, or two submits racing, into a clean 409 instead of a 500. The specs check this.
- **Answer keys stay secret.** `Option.isCorrect` must never reach a student. The question-bank endpoints are staff-only. The one student endpoint, `GET /attempts/:attemptId/questions` (owner only, attempt IN_PROGRESS), returns `PublicQuestion[]` built field by field in `QuestionLookupAdapter.getPublicQuestionsForExam`. Any new student-facing question endpoint must do the same.
- **Modules stay loosely coupled.**
  - Attempt and answer code reaches exams and questions only through `IExamLookupService` and `IQuestionLookupService`. These are DI tokens bound to the `*-lookup.adapter.ts` files.
  - Their entities refer to other tables by ID only, never through TypeORM relations.
  - Both adapters swallow errors. Exam lookup returns `null` and question lookup returns `[]`.
  - `isStudentAssignedToExam` returns `true` when an exam has no assignments, and also when the lookup fails.
- **"studentId" means two different things.**
  - `exam_assignments.student_id` usually holds a `students.id`, which is what the staff UI assigns through `/students/lookup`. The dev seed stores a `users.id` there instead, and `assignStudent` accepts either.
  - `attempts.studentId` and `results.studentId` hold the JWT `sub`, which is a `users.id`.
  - `listAssignedStudents` resolves each assignment's `userId` through `students.userId`. `isStudentAssignedToExam` matches the JWT `sub` against that `userId`, or against the raw `student_id`.

### Audit logging
- `AuditModule` is `@Global`, so `AuditService` can be injected anywhere.
- `logEvent(type, metadata, actorId, ip?)` copies `metadata.examId` and `metadata.attemptId` into indexed columns. Include them, or the audit viewer can't filter by exam or attempt.
- `type` is a varchar, so a new event type needs no migration. Still add it to `AuditEventType`.
- The auth, user, exam and question services `await logEvent()` directly. If audit logging fails, the request fails, even though the main write has already been committed.
- Attempt and answer code calls `logAuditSafely` instead. It is best-effort and runs only after the transaction commits.
- The `@AuditLog()` decorator and its global interceptor exist, but nothing uses them.

### Database
- **Schema sync:** when `NODE_ENV` is anything other than `production`, TypeORM runs with `synchronize: true`, so the development schema follows the entities. Production relies only on migrations.
  - Every entity change needs a migration.
  - Generate it against a database where only migrations have been applied. A database that synchronize has already updated produces an empty migration.
- **New entities:** register each one in its module's `TypeOrmModule.forFeature`, and also add it to `src/database/data-source.ts`, which is the list of entities the migration CLI uses.
- **Migration order:** migrations run in timestamp order. The existing ones use hand-picked timestamps ordered by foreign-key dependency. Some foreign keys to `users` and `students` are commented out.
- **Column names:** naming depends on the table.
  - B's tables (`exams`, `questions`, `options`, `exam_questions`, `exam_assignments`) use snake_case through explicit `name:` options.
  - All other tables use camelCase, so double-quote those column names in raw SQL.

### Other gotchas
- `NEXT_PUBLIC_API_URL` is inlined at build time, including inside `api-client`. That is why `api-client` is listed in `transpilePackages`. Rebuild after changing it.
- Keep `class-validator` and `class-transformer` at the same versions in `apps/api` and `packages/validation` so npm installs a single shared copy. Decorator metadata, such as `@Type` on query DTOs, is registered in whichever copy the DTO file imports.
- Running the full stack with `docker compose up --build` has known problems:
  - `apps/api/.env` points `DATABASE_URL` at `localhost`. Inside the container that is not Postgres; it needs `postgres:5432`.
  - The API Dockerfile doesn't build `packages/*` before `api:build`.
  - The image's final stage copies `node_modules` but not `packages/`. The `@secure-exam/*` entries in `node_modules` are links into `packages/`, so they break.
