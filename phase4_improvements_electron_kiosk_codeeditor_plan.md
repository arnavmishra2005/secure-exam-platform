# Next Iteration — Improvements + Electron/Kiosk/Security + Python Code Editor
### Implementation Strategy, Order of Work, File Structure & 3-Person Split

Legend: **[A]** · **[B]** · **[C]** = owner of the file/folder. **[SHARED]** = additive one-line edits only, agreed protocol (section 9).

---

## 0. Decisions to Confirm Before Day 0 (recommended defaults)

| # | Question | Recommended default | Why |
|---|---|---|---|
| 1 | What does "Publish should send everyone registered" mean? | Publishing an exam makes it visible to **all registered students** (dashboard + in-app notification + optional email). Results publishing uses the same mechanism. | Assumed from your wording — confirm. |
| 2 | One login page for both roles | Merge `admin-web` (Next.js) and `exam-client/renderer` (Vite) into **one Vite + React SPA (`apps/web`)** with role-based routes (`/admin/*`, `/student/*`). | Electron needs to load one app anyway; admin pages are client-side CRUD, so porting is mostly mechanical (routing swap). Cross-origin token hand-off between two apps is the fragile alternative. |
| 3 | Where can students take exams? | Only in the **Electron app** (enforced by backend per exam via `requireSecureClient`, default ON). Browser students can use dashboard/results. | Otherwise kiosk can be bypassed by using a browser. |
| 4 | Code execution engine | **Judge0 CE (self-hosted, Docker)** behind our own `ExecutionProvider` interface. | Sandbox (isolate), limits, and many languages already solved → "extend later" is config, not rewrite. |
| 5 | Which code submission counts for marks? | **Last "Submit"**; if student never pressed Submit, the **latest saved draft is graded at attempt end**. | Prevents losing marks. Alternative: best submission — config flag. |
| 6 | Windows lab edition | Verify now: Assigned Access (Win32 single-app) needs Windows 11 Pro/Enterprise/Education; Shell Launcher + Keyboard Filter need Enterprise/Education. | Decides the kiosk approach in Phase 5 of this plan. |
| 7 | Clipboard in code editor | Allow copy/paste **only inside the app** (internal clipboard); block paste of text copied from outside. | Typical coding-exam policy; configurable per exam. |

---

## 1. What Gets Built (scope, mapped to owner)

| Requirement | Owner | Size |
|---|---|---|
| UI overhaul (design system, layouts, all pages restyled) | **A** builds kit; **everyone** restyles pages they own | L |
| Single login page for admin + students | A | S |
| Course-wise students (courses, enrollment, assign exam by course) | A | M |
| Publish → all registered students (+ notifications) | A | M |
| Results page: exam list → click exam → detail; overall analysis; student-wise | A | L |
| Which student answered which questions (matrix + drill-down) | B (Questions tab) | M |
| Question bank (course/topic/difficulty/tags, search, import, pick into exam) | B | M |
| Code editor (Python): authoring, execution service, grading, exam UI | B | XL |
| Extend exam timing (all students / single student) | C | M |
| Student dashboard | C | M |
| Electron app (wrap web app, SQLite persistence swap) | C | L |
| Kiosk (Windows) + security layer (policy, device binding, audit, readiness) | C | XL |

Rough total ≈ 20–22 person-weeks → **~6–7 weeks with 3 people** (estimate; spikes in week 1 will refine it).

---

## 2. Implementation Order (and why)

**Principle:** unblock others first → de-risk the scary parts early → integrate late.

### Stage 0 — Shared Foundation (Days 1–3, all three)
- Create `apps/web` (Vite + React + TS), migrate existing exam-client code in; port admin pages **later** by owner (don't block on it).
- Install **Tailwind + shadcn/ui**, define design tokens (A leads, 1 day, others review).
- Add **Redis** to docker-compose (needed by code-run queue; also usable for rate limiting).
- Install `@nestjs/event-emitter`; create `common/events/events.ts` with the event list in section 9.
- **Freeze contracts** (write as TypeScript in `packages/types` / interfaces, no logic): new entity shapes (section 4), `IOfflineStore` v2 (section 7), `ExecutionProvider`, `ScoreRecorder`, `ExamService.extendEndTime` signature.
- Add `.github/CODEOWNERS` (folder → person) so PRs auto-request the right reviewer and accidental cross-edits are visible.

### Stage 1 — Week 1: Unblockers + Risk Spikes
| | Deliverables (ship by end of week 1) |
|---|---|
| **A** | UI kit + `AdminLayout/StudentLayout/ExamLayout` + unified login + role routing; **Course, CourseEnrollment, ExamCourse, ExamRegistration** entities + migrations (B and C depend on these IDs). |
| **B** | Question-table migration (course/topic/difficulty/tags) + coding entities migrations; **Judge0 running in Docker + a Python "hello world" run from Nest**; **Monaco bundled locally (no CDN) and working offline** in `apps/web`. |
| **C** | Electron shell loading `apps/web` via `app://` protocol; IPC skeleton; **better-sqlite3 store behind `IOfflineStore`**; `ExamExtension` model + `heartbeat` endpoint; **confirm Windows edition on lab PCs**. |

### Stage 2 — Weeks 2–3: Feature Build (parallel, independent)
- **A:** course/enrollment UI, registration by course, publish + notifications, `QuestionScore` + `ScoreRecorder`, results list/detail shell + Overview + Students tabs.
- **B:** question bank API+UI, coding problem authoring (test cases), run/submit pipeline with BullMQ queue, grading → `ScoreRecorder`.
- **C:** extension UI + client time resync, student dashboard, Electron hardening (navigation/input/focus/display), device sessions, per-exam security policy, desktop adapter for `IOfflineStore`.

### Stage 3 — Weeks 4–5: Integration
- Coding editor inside the exam page **running inside Electron** (B + C pair for 1–2 days: Monaco in `app://`, CSP, offline draft saving into SQLite).
- Code scores flowing into Results → Questions tab (B) and Overview (A).
- Kiosk scripts tested on a **real Windows lab machine** (C).
- Each person restyles their remaining pages with A's kit.
- Security events → audit → monitoring page; violation counts shown in results Students tab.

### Stage 4 — Week 6(–7): Hardening & Release
- Security matrix (section 10), runner abuse tests, load test (100–300 concurrent runs), installer + code signing, UAT with a pilot exam, docs.

---

## 3. Repo Layout

```
secure-exam/
├── apps/
│   ├── api/                       NestJS (existing, extended)
│   ├── web/                       NEW unified SPA (replaces admin-web + exam-client/renderer)
│   └── desktop/                   NEW Electron shell
├── packages/
│   ├── types/                     shared interfaces (one file per feature)
│   ├── validation/                shared DTO schemas
│   ├── api-client/                typed client (one file per feature)
│   └── persistence/               MOVED: IOfflineStore v2 + IndexedDB impl + syncEngine (framework-agnostic TS)
├── infra/
│   ├── docker-compose.yml         base: postgres, redis, api   [A, additive]
│   ├── docker-compose.judge0.yml  [B]
│   ├── judge0/                    [B] judge0.conf, README
│   └── windows-kiosk/             [C] scripts + docs
├── .github/CODEOWNERS             [SHARED, set Day 0]
└── docs/                          analytics-data-contract.md [A], execution-security.md [B], kiosk-runbook.md [C]
```

---

## 4. New Data Model (additions only — nothing existing is renamed)

New tables live in **new migration files owned by the module owner**; links to other owners' tables are **by ID only**.

**[A]**
- `Course(id, code, name, term)`
- `CourseEnrollment(courseId, studentId)`
- `ExamCourse(examId, courseId)`
- `ExamRegistration(examId, studentId, source: COURSE|MANUAL, notifiedAt)`
- `Notification(id, userId, type, payload, readAt, emailStatus)`
- `QuestionScore(attemptId, questionId, score, maxScore, source: AUTO_MCQ|AUTO_CODE|MANUAL, gradedAt)` ← **single source for all analytics**
- `Exam` gets new columns: `publishedAt`, `publishedBy`, `passPercentage` (A owns exam table)

**[B]**
- `Question` gets: `courseId`, `topicId`, `difficulty`, `status` ; new `Topic`, `QuestionTag`
- `CodingProblem(questionId, statementMd, starterCode JSON{lang→code}, timeLimitMs, memoryLimitMb, comparisonMode, allowedLanguages)`
- `CodingTestCase(problemId, input, expectedOutput, isSample, weight, order)`
- `CodeRun(id, attemptId, questionId, language, code, stdin, status, stdout, stderr, timeMs, memoryKb)`
- `CodeSubmission(id, attemptId, questionId, language, code, status, passed, total, score, resultsJson)`
- `ExamQuestionSnapshot(examId, questionId, payload JSON)` — frozen on publish so later question edits can't change a live exam

**[C]**
- `ExamExtension(id, examId, attemptId?, extraMinutes, reason, createdBy, createdAt)` — append-only, auditable
- `ExamSecurityPolicy(examId, requireSecureClient, requireKiosk, blockMultiMonitor, warnAfter, flagAfter, autoSubmitAfter)`
- `DeviceSession(id, userId, deviceId, clientType, clientVersion, attemptId?, lastHeartbeatAt, status)`
- `ClientRelease(minVersion, latestVersion, downloadUrl)`

---

## 5. Backend — `apps/api/src` (file ownership)

```
common/
├── guards/ filters/ decorators/                    [A]  (existing)
└── events/events.ts                                [SHARED additive]   domain event names/payloads

modules/
├── auth/                                           [A]  login returns {tokens, user{role}}; accepts X-Client-Type; rejects admin on desktop unless dev flag
├── user/                                           [A]
├── course/                                         [A]  NEW  course.controller/service/entities (Course, CourseEnrollment), CSV enroll import
├── registration/                                   [A]  NEW  ExamRegistration; "register course → expands to students"; manual add/remove
├── exam/                                           [A]  + publish.service.ts (validate → freeze → emit exam.published), extendEndTime()
├── notification/                                   [A]  NEW  listens to exam.published/results.published → in-app (+ SMTP via nodemailer)
├── results/                                        [A]  NEW
│   ├── score-recorder.service.ts                   [A]  record(attemptId, questionId, score, max, source)  ← B & C call this
│   ├── mcq-evaluator.service.ts                    [A]  on attempt.submitted → scores MCQ → QuestionScore
│   ├── results.controller.ts                       [A]  GET /results/exams, /results/exams/:id/overview, /students
│   └── overview.queries.ts                         [A]  mean/median/min/max/stddev/pass-rate/histogram/avg time (SQL aggregates on QuestionScore+Attempt)
│
├── question/                                       [B]  (existing) + filters
├── question-bank/                                  [B]  NEW  search, tags/topics, import/export, add-to-exam (manual + rule-based pick), snapshot-service (listens exam.published)
├── coding/                                         [B]  NEW  problem/test-case CRUD, run/submit controllers, code-grading.service (on attempt.submitted)
├── execution/                                      [B]  NEW
│   ├── execution-provider.interface.ts             [B]  run(job) → RunResult
│   ├── judge0.provider.ts                          [B]
│   ├── language.registry.ts                        [B]  python → {judge0Id, monacoId, ext, starter, limits}
│   └── run.queue.ts / run.processor.ts             [B]  BullMQ (Redis), per-student concurrency=1, rate limit
├── question-analytics/                             [B]  NEW  per-question stats, option distribution, who-answered-which matrix, code test pass-rates
│
├── attempt/                                        [C]  (existing) + start-gates (policy, device, registration), heartbeat
├── answer/ submission/                             [C]  (existing) submit emits attempt.submitted
├── exam-extension/                                 [C]  NEW  extend-all / extend-one; effective-expiry in timer.service
├── client-security/                                [C]  NEW  client config/version gate, device sessions, security policy, violation thresholds
├── dashboard/                                      [C]  NEW  GET /me/dashboard (upcoming/live/completed/results/notifications count)
└── audit/                                          [C]  (existing) + summary endpoints (violation counts per student/exam)

database/migrations/   timestamp-named; one file per table; [A]/[B]/[C] prefix in commit message
```

**Tech:** NestJS, TypeORM + PostgreSQL, `@nestjs/event-emitter`, BullMQ + Redis, `@nestjs/throttler`, nodemailer (optional), exceljs (exports).

### Key backend behaviours
- **Publish (A):** `POST /exams/:id/publish` → checks (has questions, ≥1 registration, valid window) → sets `publishedAt` → emits `exam.published{examId}`. Listeners: B freezes questions; A's notification creates one notification per `ExamRegistration` and marks `notifiedAt`.
- **Registration by course (A):** assigning a course to an exam inserts `ExamRegistration(source=COURSE)` for each enrolled student; students enrolling later are auto-added until the exam is published (rule documented).
- **Extend timing (C):** effective expiry = `Attempt.expiresAt` (base, never mutated) + sum of matching `ExamExtension` rows. Exam-wide extension also calls A's `ExamService.extendEndTime(examId, minutes)` so late starters and A's scheduler (auto-close) see the new window. Emits `exam.extended` and an audit event.
- **Heartbeat (C):** `POST /attempts/:id/heartbeat {deviceId, focusState, clientVersion}` every ~10–15 s → returns `{serverTime, effectiveExpiresAt, status}`. Client computes clock offset from `serverTime`; this is how extensions reach running clients without WebSockets. Missed heartbeats → monitoring shows "disconnected" and logs `HEARTBEAT_LOST`.
- **Start-attempt gates (C):** JWT is student · registered · exam active · policy allows client (`desktop` + version ≥ `minVersion`) · no other active `DeviceSession` · device not changed mid-attempt.
- **Code run (B):** `POST /attempts/:id/code/run` (custom stdin) and `/code/submit` (hidden tests) → validate attempt active + ownership + size caps (code ≤ 64 KB, stdin ≤ 1 MB) → enqueue → client polls `GET /code/runs/:id`.
- **Grading (B):** on `attempt.submitted`, grade last Submit (or latest draft) → `ScoreRecorder.record(..., AUTO_CODE)`; partial marks by test-case weights.
- **Analytics (A/B):** read-only queries on `QuestionScore`, `Attempt`, `Answer`, `ExamRegistration`. Contract documented in `docs/analytics-data-contract.md` — renaming a listed column needs A's sign-off.

---

## 6. Frontend — `apps/web/src` (feature-folder ownership)

```
main.tsx                                         [A]
app/
├── App.tsx / providers.tsx                      [A]
└── router.tsx                                   [A]  composes `routes` arrays exported by each feature (additive one-liners)
shared/
├── ui/                                          [A]  shadcn/ui components, tokens, Tailwind config
├── layouts/ AdminLayout / StudentLayout / ExamLayout   [A]  menu items come from each feature's `nav.ts`
├── auth/ AuthContext, ProtectedRoute, RoleGuard [A]
├── lib/ apiClient.ts, queryClient.ts            [A]
├── desktop/ useDesktop.ts, desktopStore.ts      [C]  detects window.desktop; IOfflineStore adapter over IPC
└── time/ useServerClock.ts                      [C]  offset from heartbeat serverTime

features/
├── auth/            LoginPage, routes            [A]  one page; ADMIN→/admin/exams, STUDENT→/student/dashboard
├── courses/         list, detail, enroll import  [A]
├── students/        list/add/import              [A]
├── exams/           list, edit, schedule, registrations (by course/manual), PublishDialog   [A]
├── results/
│   ├── routes.tsx, ResultsExamListPage.tsx       [A]  exams shown first
│   ├── ResultsExamDetailPage.tsx                 [A]  click exam → tab host
│   ├── tabs.registry.ts                          [A]  additive: one line per tab
│   ├── tabs/OverviewTab.tsx                      [A]  KPIs, histogram, pass rate, rank table, avg time (Recharts)
│   ├── tabs/StudentsTab.tsx                      [A]  student-wise scores, status, violation count (from C's audit summary)
│   └── tabs/QuestionsTab/                        [B]  per-question accuracy, who-answered-which matrix, view submitted code
├── question-bank/   list/filter/import, QuestionForm, PickForExamDialog      [B]
├── coding/                                       [B]
│   ├── authoring/ ProblemEditor, TestCaseTable, StarterCodeEditor
│   ├── editor/ CodeEditorPanel, ProblemStatementPanel, RunResultsPanel, monacoSetup.ts (local bundle, no CDN)
│   ├── CodingQuestionView.tsx                    [B]  registered into exam page renderer registry
│   └── hooks/ useCodeRun, useCodeDraft           [B]
├── exam-taking/                                  [C]  (existing exam UI) ExamPage, palette, navigation, submit modal
│   └── questionRenderers.registry.ts             [C]  MCQ → existing view; CODING → B's CodingQuestionView (B adds 1 line)
├── dashboard/       StudentDashboard, cards      [C]
├── monitoring/      live attempts, ExtendTimeDialog, disconnected/flagged badges      [C]
└── audit/           viewer                       [C]
```

**Tech:** React + TypeScript + Vite, React Router, **Tailwind + shadcn/ui** (design system), React Query, Zustand, Recharts (charts), TanStack Table (tables), React Hook Form + zod (forms), `@monaco-editor/react` with locally bundled Monaco.

### UI overhaul approach ("Bad UI")
1. **A** ships the kit in week 1: tokens (colors, spacing, type), Button/Input/Select/Table/Dialog/Tabs/Badge/Toast/Skeleton/EmptyState, app shell (sidebar + topbar), responsive grid.
2. **Each owner restyles the pages in their own folders** using the kit — no one edits another person's page for styling.
3. Rules: every list has loading/empty/error states; consistent forms and validation messages; light + dark tokens; keyboard accessible.

### Exam-taking specifics for the code editor (B inside C's exam page)
- Layout: problem statement (markdown) | Monaco editor | Run panel (custom input, sample tests, hidden-test pass/fail counts only).
- Buttons: **Run** (custom stdin), **Run Samples**, **Submit** (all tests, counts for marks).
- Autosave code draft every few seconds into `IOfflineStore` (works offline; syncs later).
- Editor hardening (config per exam): block external paste, disable drag-drop & context menu, optional disable autocomplete.
- Python only now; language dropdown is rendered from `language.registry` — adding Java later = one registry entry + provider support.

---

## 7. Persistence & Electron — `packages/persistence` + `apps/desktop`

### `IOfflineStore` v2 (frozen Day 0)
```ts
saveAnswer / getAnswer / getPendingAnswers / markSynced        // existing
saveCodeDraft(attemptId, questionId, language, code) / getCodeDraft(...)   // NEW (B uses)
enqueueEvent(type, payload) / getPendingEvents(attemptId) / markEventSynced(id) // NEW (C: security events survive offline)
```
`syncEngine` (framework-agnostic) now syncs answers + code drafts + security events with retry/backoff.

### `apps/desktop` structure [all C]
```
apps/desktop/
├── package.json                 electron-builder (NSIS installer), signing config
├── src/main/
│   ├── main.ts                  lifecycle, single-instance lock
│   ├── windowManager.ts         fullscreen kiosk window, always-on-top, no menu, setContentProtection(true)
│   ├── protocol.ts              app:// serving apps/web/dist (no localhost server)
│   ├── navigationGuard.ts       will-navigate block, setWindowOpenHandler deny, request allowlist (API origin only), strict CSP
│   ├── inputGuard.ts            before-input-event shortcut blocking, DevTools disabled in prod
│   ├── focusMonitor.ts          blur/focus → enqueueEvent(FOCUS_LOST/REGAINED)
│   ├── displayMonitor.ts        multi-monitor / display-change detection
│   ├── readiness/checks.ts      version, network, backend reachable, kiosk active, single display, (optional) banned processes
│   ├── platform/ PlatformSecurity.ts · windows.ts · linux.ts(stub) · macos.ts(stub)
│   ├── store/ sqliteStore.ts · migrations.ts · ipc.ts     better-sqlite3; sensitive fields encrypted with Electron safeStorage
│   └── ipc/channels.ts
├── src/preload/preload.ts       contextBridge → window.desktop {store, security, app}  (contextIsolation ON, nodeIntegration OFF)
└── src/shared/ipc-types.ts
```
`apps/web/src/shared/desktop/desktopStore.ts` implements `IOfflineStore` by calling `window.desktop.store.*`; `packages/persistence/index.ts` factory returns IndexedDB in browser, desktop adapter in Electron — **no feature code changes**.

**Tech:** Electron, TypeScript, better-sqlite3, electron-builder, contextBridge/IPC.

---

## 8. Kiosk + Security Layer (C)

### OS level — `infra/windows-kiosk/`
```
Setup-ExamKiosk.ps1        creates local exam user, installs app, applies policies
assigned-access.xml        single-app kiosk config (or Shell Launcher config, per edition decision #6)
keyboard-filter.ps1        blocks Win key, Alt+Tab, Alt+F4, Ctrl+Esc (Enterprise/Education)
policies.reg               disable Task Manager, lock/change-password/switch-user options, etc.
lab-checklist.md           per-machine verification steps
README.md (kiosk-runbook)  install, rollback, troubleshooting
```
Linux/macOS: `PlatformSecurity` stubs only; implementation later without touching app code.

### Application/back-end security
- Per-exam `ExamSecurityPolicy`; violation ladder: **warn → flag → optional auto-submit** (thresholds set by admin).
- Audit events (namespaced, defined in C's own constants): `FOCUS_LOST`, `FOCUS_REGAINED`, `DISPLAY_CHANGED`, `BLOCKED_SHORTCUT`, `DEVTOOLS_ATTEMPT`, `NAV_BLOCKED`, `CLIPBOARD_BLOCKED`, `KIOSK_CHECK_FAILED`, `HEARTBEAT_LOST`, `CLIENT_VERSION_REJECTED`.
- Single active session per student + device binding (deviceId claim in token).
- Code-run endpoints: attempt-active check, ownership, size caps, rate limit (B).
- **Honest limit:** client-side kiosk/readiness flags are *self-reported* and advisory; real enforcement is the OS lockdown + server-side checks. The plan never trusts the client for timing, scoring or authorization.

### Code-execution security (B)
- Execute **only** in Judge0 workers on an isolated Docker network — never on the API host; no network egress, no secrets in runner env.
- Limits: CPU 2 s, wall 5 s, memory 256 MB, output cap, process/file limits (per-problem override).
- Python: single pinned Python 3 version, standard library only, no pip.
- Abuse test suite (fork bomb, infinite loop, memory bomb, outbound network, file writes, env reads) must all be contained before release.

---

## 9. How Everything Connects (integration seams — the "no-conflict" contract)

| Seam | Mechanism | Owner of file | Who plugs in |
|---|---|---|---|
| **Domain events** | `@nestjs/event-emitter`; names/payloads in `common/events/events.ts`: `exam.published` (A), `exam.extended` (C), `attempt.started` / `attempt.submitted` (C), `results.published` (A), `code.graded` (B) | SHARED additive | A notifies, B freezes snapshots/grades code, A evaluates MCQ |
| **Scores** | `ScoreRecorder.record()`; one `QuestionScore` table | A | B (code), A (MCQ), manual later |
| **Exam window** | `ExamService.extendEndTime(examId, minutes)` | A | C calls it from extension service |
| **Question rendering** | `questionRenderers.registry.ts` | C | B adds `CODING → CodingQuestionView` |
| **Results tabs** | `tabs.registry.ts` | A | B adds `QuestionsTab` |
| **Routes & nav** | each feature exports `routes.tsx` and `nav.ts`; `router.tsx` + layouts compose them | A | everyone adds one line |
| **Offline storage** | `IOfflineStore` v2 interface (frozen) | C (impls) | B uses drafts; sync engine handles all |
| **Audit event names** | per-module constants (strings), `AuditService.logEvent(type: string, …)` | each module | no shared enum edits |
| **API client & types** | one file per feature in `packages/api-client` / `packages/types` | each owner | `index.ts` re-export lines additive only |
| **Database** | timestamp migrations, FK by ID only, no cross-module entity imports in services | each owner | order migrations by dependency (A's Course/Registration first) |
| **Config** | `.env.example` sections prefixed `JUDGE0_`, `REDIS_`, `SMTP_`, `DESKTOP_`; compose overlays (`docker-compose.judge0.yml`) | each owner | no two people edit the same lines |
| **Analytics data contract** | `docs/analytics-data-contract.md` lists tables/columns analytics reads | A | B/C notify A before schema changes |

### Dependency map
```
A: UI kit + shell + login; Course/Registration entities; ScoreRecorder; ExamService.extendEndTime
   │                        │                              │
   ▼                        ▼                              ▼
B: (uses kit, Course IDs,   C: (uses kit, Registration,    both stub these on Day 1,
   ScoreRecorder)              extendEndTime)               swap to real later

C: IOfflineStore impls (drafts, events), heartbeat, exam page + renderer registry
   └──► B: CodingQuestionView plugs in; B tests Monaco inside Electron with C (Stage 3)

B: CodingQuestionView, QuestionsTab, QuestionScore writes
   └──► A: Overview/Students tabs read QuestionScore
```
Everyone can start Day 1 against **stubs of the frozen contracts**; real implementations replace them with no caller changes.

### Git/merge protocol
- `develop` is the integration branch; short-lived feature branches per feature folder; PRs touch only your folders + one-line additions in SHARED files.
- **CODEOWNERS** enforces review by folder owner.
- Integration merge + full-stack smoke test every 2–3 days; weekly demo of the end-to-end flow.
- `apps/admin-web` and `apps/exam-client/renderer` are frozen once `apps/web` is created; pages are ported by their owners and the old apps deleted at the end of Stage 3.

---

## 10. Testing & Exit Criteria

**Per person**
- **A:** publish creates registrations/notifications for exactly the registered students; course enrollment expands correctly; analytics numbers match a hand-calculated fixture exam; login routes by role.
- **B:** question bank filters/import; run/submit lifecycle; partial scoring; abuse suite contained; 100–300 concurrent runs stay within SLA (queue behaves, no API impact); code draft survives offline + app restart.
- **C:** extension reaches a running client within one heartbeat; per-student vs all-students extension; Electron blocks navigation/DevTools/shortcuts; focus-loss and display-change events logged (also offline → synced later); single-session enforcement; dashboard states correct.

**Shared end-to-end scenario (run after every integration merge)**
Admin logs in (single page) → creates course + enrolls students → builds exam (MCQ from bank + Python coding question) → publishes → registered students see it on dashboard → student logs in via Electron kiosk → solves MCQ + coding (offline blip mid-way) → admin extends time → student submits → results page shows exam → click → overview, students, questions tabs (who answered what, code results) all populated.

**Windows security matrix (on a real lab PC):** Alt+Tab · Win key · Ctrl+Alt+Del options · Task Manager · Alt+F4 · second monitor · open browser/terminal/Explorer · DevTools shortcuts · external URL · external paste · network cut/restore · app restart mid-exam · system clock change · kill process and relaunch.

**Release checklist**
- [ ] Single login for admin & students; old admin-web/exam-client removed
- [ ] Publish reaches every registered student; course-wise registration works
- [ ] Exam time extension (all/one) reflected on live clients
- [ ] Results: exam list → exam detail with overview, student-wise, question-wise, who-answered-what
- [ ] Question bank usable end-to-end; student dashboard live
- [ ] Python coding questions authored, run, graded, scored in results
- [ ] Electron installer (signed) + Windows kiosk runbook; security matrix passes
- [ ] Runner abuse tests and load test pass; secrets/CORS/rate-limits reviewed

---

## 11. Main Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Windows edition doesn't support chosen kiosk mode | Check edition in week 1; Shell Launcher / Keyboard Filter fallback; budget a day to adjust scripts. |
| Monaco fails under strict CSP / offline | Week-1 spike: bundle locally, test inside `app://`. |
| Judge0 capacity during peak submit | BullMQ queue + per-student concurrency 1 + rate limit; load test in Stage 4; scale workers horizontally. |
| Merge conflicts in shared files | Only registries/index files are shared, additive one-liners; CODEOWNERS; frequent integration merges. |
| Analytics breaks when schemas change | Analytics reads `QuestionScore` + documented contract; schema changes announced. |
| Consolidating two frontends delays everyone | Port pages lazily by owner; A ships shell + login first; old apps stay usable until Stage 3. |
