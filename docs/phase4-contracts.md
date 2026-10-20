# Phase 4 — contracts and handoff

For the three developers working the 9-day plan. It records what the Day 1
contract session produced, what Person A and Person C (time extension,
dashboard) have delivered, and exactly where Person B and Person C's
Electron/kiosk/security work plug in.

## Status

| Area | State |
|---|---|
| Day 1 contract session (items 1–9) | Done |
| Person A — Days 1–6 (courses, registrations, UI kit, layouts, single login, exams pages, publish, notifications, ScoreRecorder + MCQ grading, results overview and students tab, students page) | Done |
| Person C — time extension, heartbeat clock, exam UI moved to `apps/web`, monitoring, `/me/dashboard`, student dashboard | Done |
| Person B — question bank, code runner, coding questions, Questions tab | **Not started.** Contracts and extension points below. |
| Person C — Electron app, kiosk scripts, client-security module | **Not started.** Contracts below. |

## Branches and merging

- Work on `feat/a-*`, `feat/b-*`, `feat/c-*`; merge target is `develop`.
- Day 7 merge order: **A → C → B**.
- Shared files are listed in `.github/CODEOWNERS`. In them, add your line;
  never reorder or reformat other people's.

## Migration naming rule

`<timestamp>-<OWNER>-<Name>.ts`, class `<OWNER><Name><timestamp>`.
Timestamps are blocked so a clean database always migrates A → B → C:

| Owner | Block | Used so far |
|---|---|---|
| A | `17923680010xx`–`17923680019xx` | `…1000` courses & registrations, `…1100` exam publish fields, `…1200` notifications, `…1300` question scores |
| B | `17923680020xx`–`17923680029xx` | — |
| C | `17923680030xx`–`17923680039xx` | `…3000` exam extensions |

Always write a working `down()`. Verified: all Phase 4 migrations run on a
clean database, revert, and re-run.

## Backend contracts

| Contract | Where | Notes |
|---|---|---|
| Domain events | `apps/api/src/common/events/events.ts` | Only `exam.published` (A emits), `attempt.submitted` (C emits), `exam.extended` (C emits). Emitted after commit. Listen with `@OnEvent(NAME, { async: true })`. A failing listener is logged and never fails the request. |
| `ScoreRecorder` | `apps/api/src/common/scoring/` | `@Inject(SCORE_RECORDER)`. `record()` / `recordMany()` upsert per `(attemptId, questionId)` and recompute `results.score`. Real implementation: `modules/results/score-recorder.service.ts`; `NoopScoreRecorder` remains for tests. |
| `ExamService.extendEndTime(examId, minutes, manager?)` | `modules/exam/exam.service.ts` | Implemented by A. Pass `manager` to join a transaction. |
| Registration check | `RegistrationService.isUserRegistered(examId, userId)` | Use this; don't read the tables. |
| `ExecutionProvider` + language registry | `apps/api/src/modules/code-runner/` | Interface, `LANGUAGE_REGISTRY` with `python`, and `NotImplementedExecutionProvider`. Not wired into `AppModule` yet. |
| Shared types | `packages/types/src/*.types.ts` | One file per feature. `question-bank.types.ts`, `coding.types.ts` and `client-security.types.ts` are contracts only. |

Data rules for anything reading results are in
[analytics-data-contract.md](analytics-data-contract.md).

## Frontend contracts (`apps/web`)

| Registry | File | Add |
|---|---|---|
| Routes | `src/app/registry/routes.tsx` | Your feature's `RouteObject[]` under `adminRoutes`, `studentRoutes` or `examRoutes` |
| Navigation | `src/app/registry/nav.ts` | One `NavItem` |
| Question renderers | `src/features/exam-taking/questionRenderers.registry.tsx` | `CODING: CodingQuestionView` (Person B) |
| Results tabs | `src/features/results/tabs.registry.ts` | `{ id: 'questions', … }` (Person B) |
| Exam detail tabs | `src/features/exams/examTabs.registry.ts` | Optional richer question tab (Person B) |

`IOfflineStore` v2 (`src/features/exam-taking/persistence/offlineStore.interface.ts`):
answers and submit intent (unchanged), code drafts (`saveCodeDraft`,
`getCodeDraft`, `getAllCodeDrafts` — B), queued events (`queueEvent`,
`getQueuedEvents`, `removeEvents` — C). The in-memory store implements all of
it. The IndexedDB store persists answers; drafts and events are in memory
until B (Day 3) and C (Day 5) add their object stores. The shared contract
tests in `persistence/__tests__/offlineStore.contract.ts` cover v2.

The UI kit (`src/components/ui`) is shadcn/ui-style on the project palette.
Use it rather than raw Tailwind for new screens.

## Behaviour changes to know before merging

1. **Registration is strict.** A student can start an exam only with an
   `exam_registrations` row. Phase 1 admitted everyone to an exam with no
   assignments, and treated lookup errors as "assigned"; both now deny.
2. **Publishing is required.** Unpublished exams are invisible to students
   and can't be started. The migration marks existing non-draft exams as
   published, so exams running during the upgrade keep working.
3. **`exam_assignments` is replaced by `exam_registrations`.** The migration
   copies assignments (resolving users.id to students.id) and drops the old
   table. The Phase 1 routes `GET/POST/DELETE /exams/:id/students` still work
   and now read and write registrations.
4. **Heartbeat returns a body**: `{ serverTime, expiresAt, remainingSeconds, status }`.
5. **`Exam` has two more fields**: `publishedAt` and `passPercentage` (default 40).
6. **`results.score` now applies negative marking**, because it is the sum of
   per-question scores. The MCQ grader runs right after submission; until it
   finishes, the submit-time total (no negative marking) is shown.
7. **New env var**: `HEARTBEAT_DISCONNECT_SECONDS` (default 45). Add
   `http://localhost:3003` to `CORS_ORIGIN` for the web app.

## New API endpoints

| Method and path | Role | Owner |
|---|---|---|
| `GET /auth/me` | any | A |
| `GET/POST /courses`, `GET/PATCH/DELETE /courses/:id` | admin | A |
| `GET/POST /courses/:id/students`, `DELETE /courses/:id/students/:studentId` | admin | A |
| `GET/POST /exams/:id/registrations`, `DELETE /exams/:id/registrations/:studentId` | admin | A |
| `GET/POST /exams/:id/courses`, `DELETE /exams/:id/courses/:courseId` | admin | A |
| `GET /exams/:id/publish-readiness`, `POST /exams/:id/publish` | admin | A |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | any (own) | A |
| `GET /results/exams`, `GET /results/exams/:id/overview`, `GET /results/exams/:id/students` | admin | A |
| `POST /results/exams/:id/publish-results`, `POST /results/exams/:id/recompute` | admin | A |
| `GET/POST /exams/:id/extensions` | admin | C |
| `GET /me/dashboard`, `GET /me/exams/:examId` | student | C |

`GET /attempts` (monitoring) now also returns `studentName`, `collegeId`,
`examTitle`, `isDisconnected`, `extendedMinutes`, and the security stubs
`violationCount` (null) and `isFlagged` (false).

## Stubs waiting for their owners

| Stub | Replace with |
|---|---|
| `violationCount: null`, `isFlagged: false` in monitoring and the results Students tab | Person C's security-event counts |
| `NotImplementedExecutionProvider` | Person B's `DockerRunnerProvider` |
| In-memory code drafts and event queue inside the IndexedDB store | IndexedDB object stores (B, C) |
| Question tab on the exam page: a port of the Phase 1 add/remove list | Person B's question bank Add-to-exam dialog |
| Client type/version gate on starting an attempt | Person C's `client-security` module |

## Legacy apps

`apps/admin-web` (Next.js) and `apps/exam-client/renderer` (Vite) are
untouched apart from type fixes and keep working against the new API. The
exam-taking code was copied, not moved, into
`apps/web/src/features/exam-taking`. Retire the legacy apps after the Day 8
end-to-end run.

## Verification done

- API: 124 unit tests; typecheck and lint pass (0 errors).
- Web: 60 tests (including the moved persistence and sync suites, the v2
  store contract, the server clock, and a router smoke test for both roles);
  typecheck and production build pass.
- Against a real Postgres 16, with the API in production mode (no schema
  synchronize, so entities must match migrations): a 49-step scenario
  covering courses, registration, publish and late-enrolment notification,
  the start gates, per-student and whole-exam extensions reaching the
  heartbeat, monitoring, negative-marked grading, results stats and ranking,
  publishing results, unassigning a course, and the legacy routes.
