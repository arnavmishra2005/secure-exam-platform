# 9-Day Delivery Plan (3 People, Independent Work, Merge at the End)
### Plus: Windows edition requirements for kiosk, and what changes with Linux

Legend: **[A] [B] [C]** = owners from the previous plan (`phase4_improvements_electron_kiosk_codeeditor_plan.md`). Folder names and ownership are unchanged; this document only **compresses scope and sequencing**.

---

## 1. Reality Check (read first)

- 3 people × 9 days = **27 person-days**. The previous plan was estimated at roughly **100 person-days**. Everything cannot be delivered at full depth in 9 days.
- This plan keeps **every headline feature you listed**, but at **MVP depth**. Things that are cut are *deferred*, not forgotten (section 9).
- The schedule only works if: (1) contracts are frozen on Day 1 morning, (2) nobody adds scope, (3) a **feature freeze happens at end of Day 6**.
- "Merge at the end" is workable here **because** each person works in their own folders against agreed stubs. I still strongly recommend two 30-minute **merge dry-runs** (end of Day 3 and Day 5) into a throw-away `integration-test` branch. They cost almost nothing and catch structural conflicts while they're cheap. Real merge = Day 7.

### Calendar at a glance
| Day | Mode |
|---|---|
| 1 (morning) | **Contract session — all three together (3–4 h)** |
| 1 (afternoon) – 6 | **Independent build** on own branches (feature freeze end of Day 6) |
| 7 | **Merge day** (all three together) + wiring |
| 8 | End-to-end scenario, Electron/Monaco/kiosk testing on a real machine, bug fixing |
| 9 | Bug-fix only, installer build, demo, docs/runbook |

---

## 2. Decisions to Lock in the First Hour of Day 1

| # | Decision | Recommendation for a 9-day timeline |
|---|---|---|
| 1 | Lab OS | **Which OS and which Windows edition?** (see sections 3–4). This decides C's kiosk work. Check on a real lab PC *today*. |
| 2 | Code runner | **Custom Docker-per-run runner** behind the `ExecutionProvider` interface, **not Judge0** for now. Judge0 CE needs privileged host access and, on many modern Linux hosts, a cgroup-v1 kernel setting (GRUB change + reboot), which is a risky time sink on dev laptops. Swap to Judge0 later by adding one provider class. |
| 3 | Queue | **No Redis/BullMQ.** Use an in-process concurrency limiter (e.g., `p-limit`) + one-run-per-student lock + existing throttler. |
| 4 | Local persistence in Electron | **Keep IndexedDB** (works inside Electron). **SQLite swap deferred.** |
| 5 | Single login | **Go with one Vite SPA (`apps/web`)**. Pages are *rebuilt* with the new UI kit (port + restyle in one pass — no separate port step). |
| 6 | Publish meaning | Make exam visible to all registered students + in-app notification (email deferred). |
| 7 | Coding score rule | Last **Submit** counts; if never submitted, latest saved draft is graded at attempt end. |

---

## 3. Windows: Is Special Access Required? Can We Do This on "Normal" Windows?

### What Microsoft's docs say (verify on your exact build)
- **Assigned Access** is supported on **Pro, Enterprise, Education (and IoT Enterprise)** — **not Home**.
- Assigned Access **single-app** mode is meant for a Store (UWP) app or Edge. For a classic desktop app (our Electron `.exe`), Microsoft points to **Shell Launcher**, which is **Enterprise/Education only**.
- Assigned Access also has a **restricted user experience (multi-app)** mode where you allow only listed apps — this runs on **Pro** and is the Pro-compatible way to lock a student account to the exam app.
- Assigned Access doesn't work over Remote Desktop, needs UAC enabled, and applies the next time the kiosk user signs in.
- You need **local administrator** rights once per machine to set it up; students then use a **standard (non-admin) account**.

### So what can you build, depending on the edition?

| Tier | Windows edition | What you do | What it blocks | What it can't block |
|---|---|---|---|---|
| **0 — Soft kiosk** | **Any, incl. Home** | Electron fullscreen/always-on-top, app-level shortcut & DevTools blocking, navigation lock, focus-loss + display-change logging, readiness checks | Escapes *inside* the app | Win key, Alt+Tab, Ctrl+Alt+Del, Task Manager, other apps. These are **detected and logged**, not prevented (deterrence + audit). |
| **1 — Restricted account** | **Pro** (no special licence) | Tier 0 **+** dedicated standard exam user, **Assigned Access restricted (multi-app) profile** allowing only the exam app, per-user policies (disable Task Manager, lock/sign-out/password-change options, etc.) via registry or local Group Policy | Most escapes (Win-key combos, Alt+Tab, Start menu, launching other apps) | Ctrl+Alt+Del screen still exists (sign-out ends the session → logged as `HEARTBEAT_LOST`). |
| **2 — Full lockdown** | **Enterprise / Education** | Tier 1 **or** Shell Launcher (replace Explorer with the exam app) **+ Keyboard Filter** | Strongest | Physical/boot-level attacks (needs BIOS password, boot order, disk encryption). |

**Answer:** You **can** implement on normal Windows, but *how much is truly blocked* depends on the edition. Plan for **Tier 0 in code (works everywhere)** + **Tier 1 scripts for Pro**; add Tier 2 only if your lab PCs are Enterprise/Education.
On **Home**: Tier 0 only (plus per-user registry policies that you must test on your machine). Upgrading lab PCs to Pro is usually the cheapest fix. A native low-level keyboard hook could swallow Win/Alt+Tab on any edition, but needs a native helper — not realistic in 9 days; Ctrl+Alt+Del can't be intercepted by any app.
**Student-owned laptops (BYOD):** OS lockdown can't be enforced → only Tier 0 + proctoring signals. Exam in controlled lab PCs is assumed.

### What C builds for Windows in the 9 days
```
infra/windows-kiosk/
├── Setup-ExamKiosk.ps1      create standard exam user, install app, apply policies (run once as admin)
├── assigned-access.xml      Tier 1: restricted profile allowing only the exam app
├── shell-launcher.ps1       Tier 2 only (Enterprise/Education)
├── policies.reg             per-user: disable Task Manager, lock/sign-out/password change, etc.
├── Remove-Kiosk.ps1         rollback (always ship this)
└── README.md                edition matrix, install steps, lab checklist
```
Test in a **VM using the console, not Remote Desktop**, on Day 6; repeat on a real lab PC Day 8.

---

## 4. If We Replace Windows with Linux

**What stays the same:** the whole web app, backend, Electron app code, code editor, runner (the runner needs a Linux Docker host either way).
**What changes:** only the platform layer and provisioning. Roughly the same effort as Windows kiosk work (≈1.5–2 days for C), and **no licence/edition issues** — arguably easier to lock down *properly*.

### Code changes (all in C's area)
| Area | Change |
|---|---|
| `apps/desktop/src/main/platform/` | Implement `linux.ts` (readiness: running as exam user, expected session/compositor, display count, process scan via `/proc`) instead of `windows.ts`. `PlatformSecurity` interface already isolates this. |
| Packaging | electron-builder targets **AppImage / .deb** instead of NSIS `.exe`. Build on Linux/CI. |
| Platform quirks | Screen-capture protection (`setContentProtection`) isn't available on Linux → rely on kiosk session + monitoring. Under **Wayland**, forcing focus/always-on-top is limited → use a kiosk compositor (`cage`) or a minimal **X11** session. Decide on Day 1 with a 2-hour spike on a Linux VM. |
| Everything else | `better-sqlite3` (when added), Monaco, IndexedDB, sync engine — unchanged. |

### Provisioning (replaces `infra/windows-kiosk/`)
```
infra/linux-kiosk/
├── setup-exam-kiosk.sh      create 'exam' user (no sudo), install app, enable autologin to kiosk session
├── kiosk-session/           cage (Wayland) or minimal X11 session that launches ONLY the Electron app
│                            → no desktop, panel, Alt+Tab or Super key behaviour exists
├── disable-escapes.md/sh    disable VT switching (Ctrl+Alt+F1–F7), mask spare gettys, disable SysRq,
│                            disable Ctrl+Alt+Backspace, remove terminal/file manager or confine with AppArmor
├── usb-block.rules          block USB mass storage (udev / modprobe blacklist)
├── nftables-exam.conf       egress allowlist for the exam user: only the API server (and DNS if needed)
└── README.md                BIOS/GRUB passwords, disk encryption, image/clone procedure, rollback
```
**Advantages over Windows:** no edition dependency; no "Ctrl+Alt+Del" special screen; **per-user network allowlisting** is built in; easy to clone lab images.
**Costs/risks:** every lab PC must run Linux (dual-boot is weaker); IT team familiarity; Wayland/X11 behaviour must be tested; device drivers/hardware compatibility.
**Rule of thumb:** if you can *choose* the OS → Linux gives stronger lockdown for less licensing pain. If lab PCs are already Windows Pro → Tier 1 is good enough for most college exams.

---

## 5. Scope Tiers

| Tier | Meaning |
|---|---|
| **P0 — must ship** | Single login · publish→registered students · courses & enrollment · exam registration by course · results (exam list → detail, overview, student-wise) · who-answered-which matrix · question bank (fields, search/filter, add to exam) · Python code questions (author, run, submit, grade) · extend exam time (all/one) · student dashboard (simple) · Electron app with lockdown + focus/display logging + readiness · Windows/Linux kiosk scripts + runbook · restyled pages for everything touched |
| **P1 — if time** | Per-question accuracy stats · single-session/device binding · notification email · CSV export · audit viewer restyle · violation thresholds auto-submit |
| **Deferred** | SQLite swap · Judge0 · BullMQ/Redis · rule-based random question pick · CSV enrollment import · code signing · Linux/macOS (whichever you don't pick) · dark mode · full UI restyle of secondary pages |

If you fall behind, drop in this order: dashboard polish → audit restyle → CSV export → per-question stats → extra readiness checks → device binding. **Never drop:** login, publish, results overview, who-answered matrix, Python run/submit, extension, Electron lockdown.

---

## 6. Day 1 Morning — Contract Session (all three, then merge ONE shared PR)

Output of this session is a single merged PR that contains **stubs only** so nobody waits for anyone afterwards:

1. `apps/web` Vite+React+TS skeleton, Tailwind + shadcn/ui installed, **empty registries** (routes, nav, question renderers, results tabs).
2. `packages/types`: one new file per feature with interfaces for every new entity (see section 4 of the previous plan).
3. `common/events/events.ts`: **only** `exam.published`, `attempt.submitted` (+ `exam.extended` optional).
4. `ScoreRecorder` interface + no-op implementation (A replaces it) — B and C code against it.
5. `ExamService.extendEndTime(examId, minutes)` signature + stub (A implements, C calls).
6. `IOfflineStore` v2 interface (+ in-memory implementation): answers · code drafts (B) · queued events (C).
7. `ExecutionProvider` interface + `language.registry.ts` with Python entry (B implements).
8. `.github/CODEOWNERS`, `.env.example` with prefixed sections (`RUNNER_*`, `SMTP_*`, `DESKTOP_*`), migration naming rule (timestamp + owner prefix).
9. Branches: `feat/a-*`, `feat/b-*`, `feat/c-*` → merge target `develop`.

---

## 7. Per-Person Schedule (Days 1–6 independent)

### Person A — Platform, UX, Courses, Publish, Results
| Day | Work | Done when |
|---|---|---|
| 1 PM | `Course`, `CourseEnrollment`, `ExamCourse`, `ExamRegistration` entities + migrations + services (B & C depend on these IDs) | Migrations run; services exposed |
| 2 | UI kit essentials (Button, Input, Select, Table, Dialog, Tabs, Badge, Toast, EmptyState, Skeleton) · `AdminLayout/StudentLayout/ExamLayout` · nav registry · **unified login** + role routing (ADMIN→`/admin/exams`, STUDENT→`/student/dashboard`) · auth context | Both roles log in via one page and land correctly |
| 3 | Courses UI (list/detail/add-remove students) · assign exam to course → registrations expand · **exams pages rebuilt** (list/edit/schedule + Registrations tab) | Course-wise students visible in exam management |
| 4 | `publish.service` (+`publishedAt`, `passPercentage`) · emits `exam.published` · notification module (in-app, list endpoint) · `PublishDialog` · **real `ScoreRecorder`** + `QuestionScore` + MCQ evaluator on `attempt.submitted` | Publish creates one notification per registered student |
| 5 | Results API: exams list, overview (mean/median/min/max/pass-rate/histogram/avg time), students ranking · `ResultsExamListPage` · `ResultsExamDetailPage` tab host · **Overview tab** (Recharts) | Exams listed first; clicking one opens its analysis |
| 6 | **Students tab** (rank table, status, violations column stub) · students page restyle · `analytics-data-contract.md` · polish loading/empty/error states · freeze | All P0 for A works with stubs |

### Person B — Question Bank, Python Code Editor, Question-wise Results
| Day | Work | Done when |
|---|---|---|
| 1 PM | Migrations: question fields (`courseId`, `topicId`, `difficulty`, `status`), `Topic`, `QuestionTag`, `CodingProblem`, `CodingTestCase`, `CodeRun`, `CodeSubmission`, `ExamQuestionSnapshot` · confirm Docker on dev machine · **Monaco bundled locally (no CDN) in a throw-away sandbox** | Python "hello" runs in a container; Monaco renders offline |
| 2 | **`DockerRunnerProvider`** (details below) · `POST /attempts/:id/code/run` · concurrency limiter + per-student lock + size caps · basic abuse tests (infinite loop, memory bomb, fork bomb, outbound network) | All abuse tests are contained |
| 3 | `POST /code/submit` (hidden tests, weights, partial score, results JSON) · `CodeSubmission` · IndexedDB **draft** methods (`saveCodeDraft/getCodeDraft`) · `attempt.submitted` listener → grade last Submit/latest draft → `ScoreRecorder.record(AUTO_CODE)` | Graded score appears in `QuestionScore` (against stub) |
| 4 | **Question bank** API + UI: list, search, filter (course/topic/difficulty/tag), create/edit form, reuse existing bulk import, **Add-to-exam dialog** (manual pick) · snapshot listener on `exam.published` | Bank usable end to end |
| 5 | **Coding authoring UI** (`ProblemEditor`, `TestCaseTable`, starter code) · **`CodingQuestionView`** (Monaco + statement + stdin/stdout + Run/Run samples/Submit + results panel + draft autosave) · register in renderer registry | Student can solve a Python question in the web app |
| 6 | `question-analytics` API · **`QuestionsTab`**: who-answered-which **matrix** (students × questions: answered / not / marked / correct) + per-student drill-down + view submitted code · freeze | P0 for B works; per-question accuracy = P1 |

**DockerRunner (MVP) design:** one throw-away container per run: pinned `python:3.x-slim` image (pre-pulled), `--network none`, memory/CPU/pids limits, `--read-only` with small `tmpfs`, `--cap-drop ALL`, `no-new-privileges`, non-root user, code mounted read-only, wall-clock kill from the API side, output capped. Python stdlib only. Run it on a **dedicated Linux Docker host** (Docker socket access is root-equivalent — never share that host with secrets). Known limit: ~sub-second container start and a fixed concurrency cap, so very high simultaneous submits will queue in memory; the `ExecutionProvider` interface lets you swap in Judge0/a worker pool later.

### Person C — Time Extension, Dashboard, Electron, Kiosk & Security
| Day | Work | Done when |
|---|---|---|
| 1 PM | **Lab OS/edition check on a real PC** · `apps/desktop` Electron scaffold (main/preload, loads built `apps/web` via `app://`) · `ExamExtension`, `DeviceSession`, `ExamSecurityPolicy` entities | Electron window shows the login page |
| 2 | Extension service (all / one student) · `TimerService` effective expiry · calls `ExamService.extendEndTime` (stub) · **heartbeat endpoint** + `useServerClock` · move exam UI into `features/exam-taking` (kit-styled minimally) | Extending time changes a running client's clock within one heartbeat |
| 3 | **Monitoring page** (live attempts, last heartbeat, disconnected/flagged badges, `ExtendTimeDialog`) · dashboard aggregator endpoint (`/me/dashboard`) | Admin can extend time from UI |
| 4 | **Student dashboard UI** (upcoming / live / completed / results / notifications) · `client-security` module: start-attempt gates (registered, exam active, client type+version) · security-event ingestion + warn/flag thresholds + violation-count endpoint | Dashboard renders; browser student can't start a secure exam |
| 5 | Electron hardening: `windowManager` (fullscreen/kiosk/always-on-top), `navigationGuard` (+CSP, API-only allowlist), `inputGuard` (shortcuts, DevTools off), `focusMonitor`, `displayMonitor` → queued events via IndexedDB events impl → sync · **readiness checks** (version, network, backend, single display) | Alt+F4/F12/Ctrl+R/navigation blocked; events reach audit |
| 6 | `PlatformSecurity` + Windows (or Linux) implementation · kiosk scripts (section 3 or 4) tested in a VM · electron-builder installer config (unsigned) · runbook draft · freeze | App runs in the chosen kiosk tier in a VM |

---

## 8. Merge & Integration (Days 7–9)

**Shared files (the only places two people can collide)** — all additive one-liners:
`apps/web/src/app/router.tsx`, layout nav registry, `questionRenderers.registry.ts`, `results/tabs.registry.ts`, `common/events/events.ts`, `packages/*/index.ts`, `.env.example`, `docker-compose*.yml`.
Rule: add your line, don't reorder others'. CODEOWNERS makes the owner review.

**Day 7 — Merge day (together, ~one screen-share session)**
1. Merge order: **A → C → B** into `develop` (A provides shell/router; C owns exam page; B plugs into both).
2. Replace stubs with real implementations: `ScoreRecorder` (A) used by B; `extendEndTime` (A) used by C; renderer registry gets `CODING` (B).
3. Run all migrations from scratch on a clean DB (ordering: A's Course/Registration → B's question changes → C's attempt-related).
4. Smoke test: login → dashboard → exam list → results list.

**Day 8**
- **End-to-end scenario:** admin logs in (single page) → creates course + enrolls students → builds exam (MCQ from bank + Python question) → publishes → registered students see it → student starts in **Electron** → solves MCQ + coding (cut network briefly) → admin extends time → submit → results page: exam → overview, students, questions (matrix, code).
- **Electron + Monaco** under strict CSP/offline (B + C together, first thing in the morning).
- **Kiosk security matrix on a real lab PC** (C): Alt+Tab · Win key · Ctrl+Alt+Del options · Task Manager · Alt+F4 · second monitor · other apps · DevTools shortcuts · external URL · external paste · network cut/restore · restart mid-exam · system clock change.
- Fix bugs by owner; no new features.

**Day 9** — bug-fix only until noon; build installer; pilot run with 3–5 test students; write README/runbooks (A: user/admin guide, B: runner security notes, C: kiosk runbook); demo.

---

## 9. What Is Explicitly Deferred (and the swap path)

| Deferred | Why it's safe to defer | Swap path later |
|---|---|---|
| SQLite in Electron | IndexedDB works inside Electron for the MVP | `IOfflineStore` desktop adapter — no feature code changes |
| Judge0 / queue | DockerRunner is enough for a pilot batch | New `ExecutionProvider` class + BullMQ |
| Rule-based random pick, per-student randomization | Manual pick satisfies requirement | Add rule service in question-bank |
| Email notifications, CSV enroll import | In-app notifications + manual enroll suffice | Additive modules |
| Code signing | Internal labs can install an unsigned build | Add certificate to electron-builder |
| Device binding, auto-submit on violations | Heartbeat + warn/flag already give visibility | Extend `client-security` |
| Other OS implementation | One OS is chosen for pilot | Fill in another `PlatformSecurity` file + provisioning scripts |

---

## 10. Definition of Done (end of Day 9)

- [ ] One login page; admins and students land in the right place
- [ ] Publish reaches every registered student; course-wise registration works
- [ ] Extending time (all / single) reaches a running client within one heartbeat
- [ ] Results: exam list → click exam → overview, student-wise, question-wise, who-answered-what
- [ ] Question bank usable; student dashboard live
- [ ] Python questions authored, run, submitted, graded, and scored in results; abuse tests contained
- [ ] Electron installer works; lockdown + focus/display events verified; kiosk tier applied on a real lab PC and runbook written
- [ ] End-to-end scenario passes twice in a row on a clean database

---

## 11. Top Risks in a 9-Day Window

| Risk | Mitigation |
|---|---|
| Scope creep | Written P0/P1/deferred list; freeze end of Day 6 |
| Lab PCs are Windows Home | Tier 0 only, or upgrade to Pro, or use Linux for the pilot — decide Day 1 |
| Late discovery that merged pieces don't fit | Contract session on Day 1 + two 30-min dry-run merges (Day 3, Day 5) |
| Monaco/CSP/offline issue inside Electron | Day-1 sandbox spike (B), Day-8 first-thing test with C |
| Single-app consolidation slows A | If Day 2 ends without shell + login: fall back to keeping old admin app, single login page lives in `apps/web` and links to it (decide, don't drift) |
| Runner host security | Dedicated Linux runner host; no secrets there; document limit |
| Running out of time on QuestionsTab | Matrix first (explicit requirement); per-question stats later |
