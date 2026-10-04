# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is Phase 1 of a secure exam platform, set up as an npm-workspaces monorepo:

- `apps/api`: NestJS API
- `apps/admin-web`: Next.js admin portal
- `packages/*`: shared TypeScript packages

There is no student UI yet. The student flow (start an attempt, save answers, submit) exists only in the API and is exercised through Swagger. No student endpoint returns an exam's questions, so get question and option IDs as an admin. Kiosk and Electron lockdown are planned for later phases.

The design and module ownership are described in `phase1_backend_admin_security_task_breakdown.md` and `phase1_file_structure_and_ownership.md`. Some things those documents plan were never built: a root `database/` folder, a CI workflow, and a root `.env.example`. `secure_exam_system_implementation_plan.md` is empty.

## Commands

Run everything from the repo root:

```bash
cp apps/api/.env.example apps/api/.env && cp apps/admin-web/.env.example apps/admin-web/.env
npm install
npm run typecheck              # builds packages/* into dist/ — required before anything else (see below)
docker compose up -d postgres  # Postgres 16 on :5432
npm run migration:run
npm run api:start              # http://localhost:3000, Swagger UI at /api/docs
npm run admin:dev              # http://localhost:3001
```

- **Tests:** `npm run api:test`.
  - One file: `npm test --workspace=apps/api -- timer.service`
  - One test: `npm test --workspace=apps/api -- -t "rejects a second attempt"`
- **Lint:** `npm run api:lint`. admin-web has no ESLint config, so `npm run admin:lint` asks you to create one instead of linting.
- **Type-check without building:** `npx tsc --noEmit -p apps/api` and `npx tsc --noEmit -p apps/admin-web`.
- **Full builds:** `npm run api:build` and `npm run admin:build`.
- **Migrations:** `npm run migration:run` and `npm run migration:revert`. To generate one: `npm run migration:generate --workspace=apps/api -- src/database/migrations/<Name>`.

Things the scripts don't make obvious:

- **Shared packages are loaded from `dist/`.** Each package's `main` is `dist/index.js`, and there are no path aliases or Jest mappers. Run `npm run typecheck` on a fresh checkout and after any change under `packages/`. Despite its name, the script writes `dist/`. Until it runs, the API, its tests, the migration CLI, and admin-web can't resolve `@secure-exam/*` and won't see your changes.
- API scripts must run with `apps/api` as the working directory, because `.env` loading and the migrations glob use relative paths. The workspace scripts already do this.
- Tests exist only in `apps/api` (`src/**/*.spec.ts`). They are unit tests with mocked repositories and a mocked `DataSource`, so they need no database. One spec comment mentions a `test/integration/...` file that doesn't exist.
- **No seed data exists, and the API can't create an admin.** `POST /students` only creates `student` users. To log into the portal, insert an admin by hand. Passwords must be at least 8 characters (`LoginDto`).
  ```bash
  HASH=$(cd apps/api && node -e "console.log(require('bcrypt').hashSync(process.argv[1], 12))" 'admin-password')
  docker compose exec -T postgres psql -U exam_user -d secure_exam -c \
    "INSERT INTO users (email, \"fullName\", \"passwordHash\", role) VALUES ('admin@example.com', 'Admin', '$HASH', 'admin');"
  ```
  To log in as a student, create the student with an explicit `password`. Otherwise the API generates a random password and never returns it.

## Architecture

### Layout
- `apps/api`: NestJS 10 with TypeORM 0.3 on Postgres. Each domain has a folder under `src/modules/` (auth, user, audit, exam, question, attempt, answer). Cross-cutting guards, decorators, filters, the interceptor, and config live in `src/common/`.
- `apps/admin-web`: Next.js 14 App Router with Tailwind. Custom color tokens are in `tailwind.config.ts`.
  - Every page is a client component that calls `@secure-exam/api-client` functions in `useEffect`. There is no React Query or SWR.
  - `ProtectedRoute` guards the routes under `app/(protected)/`, on the client side only.
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
- CORS, allowing `CORS_ORIGIN`
- `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform`
- `HttpExceptionFilter`, which never sends stack traces to clients
- Three `APP_GUARD`s that run in this order: `ThrottlerGuard`, `JwtAuthGuard`, `RolesGuard`

Rules that follow from this:
- Every route requires a JWT unless it is marked `@Public()`. Only login and refresh are public. Login is limited to 5 requests per minute and refresh to 10.
- A route without `@Roles()` is open to **any** logged-in user, including students. Always declare roles. Because the guards are global, the `@UseGuards(JwtAuthGuard, RolesGuard)` on some controllers is redundant.
- Use `@CurrentUser()` from `common/decorators`. It returns a `JwtPayload` whose `sub` is the `users.id`. Nothing uses `modules/attempt/decorators/current-user.decorator.ts` or the `mock-*-lookup.service.ts` files. They are leftover stand-ins.
- Joi validates environment variables when the app starts (`common/config/env.validation.ts`). Add new variables there.
- There is no global route prefix. The routes are `/auth`, `/students`, `/exams`, `/questions`, `/exams/:examId/questions`, `/attempts`, `/attempts/:attemptId/answers`, `/submissions` and `/audit`.

### Auth
- Access and refresh JWTs are signed with separate secrets.
- `users.refreshTokenHash` stores a bcrypt hash of the most recently issued refresh token. Logout clears it.
- On every request, `JwtStrategy` checks that the user still exists and is active.
- The admin portal keeps the access token in memory and the refresh token in `localStorage`. It refreshes the access token only when a page loads, because there is no interceptor that refreshes after a 401. A tab left open longer than `JWT_ACCESS_EXPIRES_IN` (15 minutes by default) starts getting 401 errors.

### Exam → attempt → result lifecycle
- **Exams** move through `DRAFT → SCHEDULED → ACTIVE → CLOSED`, only forward, as defined by `EXAM_STATUS_TRANSITIONS`.
  - Each step is a manual admin call (`POST /exams/:id/schedule|start|close`). Nothing changes automatically when `startTime` arrives.
  - Timing can be edited, and an exam deleted, only while it is in DRAFT.
- **Attempts:** a student gets one attempt per exam, enforced by the `UQ_attempts_exam_student` constraint.
  - An attempt can start only while the exam is ACTIVE and the current time is between `startTime` and `endTime`.
  - `TimerService` sets `expiresAt` to the earlier of `start + durationMinutes` and `exam.endTime`.
  - Only the server clock decides. Times sent by the client are informational.
  - Closing an exam does not end or block attempts already in progress. They run until their own `expiresAt`.
- **Finalization** (`IN_PROGRESS → SUBMITTED | AUTO_SUBMITTED`) writes a `Submission` and an unpublished `Result`. An expired attempt is auto-submitted in two ways:
  - when the next answer save or submit arrives for it
  - by a cron sweep every 30 seconds (`AttemptExpirySweepService`)
- **Scoring:** an objective question earns marks only when the selected options exactly match the correct set. There is no partial credit. `negativeMarks` is stored but not applied. Admins can override a score (up to `maxScore`) and publish or unpublish results.

### Invariants to preserve
- **Locking attempt writes.** Every answer write and every finalization goes through `SubmissionService.withLockedInProgressAttempt`.
  - The method opens a transaction, locks the attempt row with `SELECT … FOR UPDATE`, and re-checks that the status is still `IN_PROGRESS`.
  - Write through the `EntityManager` it passes in, never through injected repositories.
  - This is what turns a save racing a submit, or two submits racing, into a clean 409 instead of a 500. The specs check this.
- **Answer keys stay secret.** `Option.isCorrect` must never reach a student. All current question endpoints are admin-only. Any endpoint that serves questions to students must return `PublicQuestion` / `PublicOption` from `packages/types`.
- **Modules stay loosely coupled.**
  - Attempt and answer code reaches exams and questions only through `IExamLookupService` and `IQuestionLookupService`. These are DI tokens bound to the `*-lookup.adapter.ts` files.
  - Their entities refer to other tables by ID only, never through TypeORM relations.
  - Both adapters swallow errors. Exam lookup returns `null` and question lookup returns `[]`.
  - `isStudentAssignedToExam` returns `true` when an exam has no assignments, and also when the lookup fails.
- **"studentId" means two different things.**
  - `exam_assignments.student_id` holds a `students.id`, which is what the admin UI assigns through `/students/lookup`.
  - `attempts.studentId` and `results.studentId` hold the JWT `sub`, which is a `users.id`.
  - The assignment check compares the two directly, so it never finds an assigned student. Map between them through `students.userId` when you work on eligibility.

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
