# Phase 5 feature plan

The next round of features, checked against the code as of 3 Nov 2026. Each feature says what exists today, what to build, who owns it (A: platform, courses, publish, results, auth; B: question bank, coding, question-wise results; C: attempts, persistence, kiosk, monitoring) and how big it is (S ≈ ½–1 day, M ≈ 2–3 days, L ≈ 4+ days).

## 1. Classification

| # | Feature | Bucket | Owner | Size |
|---|---|---|---|---|
| 1 | TA role, course staff, permissions set by the instructor | **Now** | A (+ every module's guards) | L |
| 2 | "Admin" → "Course Instructor" in the UI | **Now** | A (+ all UI owners) | S |
| 3 | UI polishing | **Now** (pass 1) / **After** (pass 2 from pilot feedback) | all | M |
| 4 | Show delays / rescheduled start and status on the student dashboard | **Now** | A | S |
| 5 | Reschedule an exam after it is published | **Now** | A (exam service is B's) | M |
| 6 | "Code not submitted" warning on Save & Next; submitted count on Finish | **Now** | B (+ C for the palette) | S |
| 7 | Coding question turns green only after Submit | **Now** | B + C | S |
| 8 | Clear coding errors: compilation, indentation, segfault, … | **Now** | B | M |
| 9 | Student can view their submitted answers after submitting | **Now** | A + B | M |
| 10 | Full analysis after results are published | **Now** | A + B | M |
| 11 | Pass mark on/off per exam | **Now** | A | S |
| 12 | Captcha when the student starts the exam | **Now** (self-hosted) | A + C | S |
| 13 | Manual mark adjustment per question; instructor decides whether TAs may | **Now** (after #1) | A + B | M |
| 14 | Question bank by topic, then by type; filtering that works | **Now** | B | M |
| 15 | Extend time for an individual student | **Mostly exists**: verify and close the gaps | C | S |
| 16 | C, C++ and Java for coding questions | **Code now, finish at deployment** (needs compiler images on the grader and on lab machines) | B (+ C for the kiosk image) | L |
| 17 | Intranet support | **Deployment** (small code changes now) | A + C + ops | M |
| 18 | Continue the exam on another device, with timing intact | **Mostly exists**: code the gaps now, prove it in a lab rehearsal | C | M |

**Buckets:**
- **Now:** application code only. It can be built and tested on a laptop today.
- **Code now, finish at deployment:** the code can be written now, but it only works end to end once infrastructure exists (Docker images, lab images, servers).
- **Deployment:** mostly configuration and infrastructure in the college network, plus a few small code changes.
- **After:** needs the system running with real users first (pilot feedback, load tests, a lab rehearsal).

**Suggested order:**
1. #1 (TA role) first. #13 and the "who can do what" checks in every other feature depend on it.
2. Then the small, visible wins, in parallel: #2, #4, #6, #7, #11, #12, #15.
3. Then #5, #8, #9, #10, #13, #14, #18.
4. In parallel, on its own track: #16 and #17. They need someone to build the images and the server setup.
5. #3 pass 2 after the pilot.

## 2. Decisions needed before building

These change what gets built, so settle them first:

1. **Instructors and courses.** Today there is one `admin` role and courses have no owner. Is "Course Instructor" just a new name for today's admin, who can see every course? Or does each instructor own specific courses and see only those?
   - This plan assumes the first for now: rename only, keep the internal role value `admin`.
   - It also leaves room for the second: the `course_staff` table in #1 can hold `INSTRUCTOR` rows later.
2. **Unsubmitted code.** `code_submissions.fromDraft` means the last *draft* is graded today when the student never pressed Submit. Feature #6 tells students "your code is not submitted", so which rule applies?
   - **(a) Unsubmitted code scores 0.** This matches the warning.
   - **(b) The draft is still graded.** This is safer for students, but then the warning should say "submit to confirm it" instead.
   - This should be a per-exam setting, defaulting to (a).
3. **Device switching.** Can a student continue on another device on their own, or only after an invigilator approves it in Monitoring? Recommendation: invigilator approval. Otherwise a second person on a second machine can take over the attempt.
4. **Rescheduling a live exam.** Can the instructor move the times while students are already writing? Recommendation:
   - before anyone starts: free to change
   - after anyone starts: only `endTime` can move later, and the change applies through extensions (#15)

## 3. Feature details

### 1. TA role (A, L)
**Today:**
- `Role` is only `admin | student` (`packages/types/src/user.types.ts`).
- 19 controllers use `@Roles(Role.ADMIN)`.
- Courses have no staff.

**Build:**
- `Role.TA = 'ta'` in types, plus a Postgres enum migration on `users.role`.
- New table `course_staff` (`courseId`, `userId`, `role` `INSTRUCTOR | TA`, `permissions jsonb`, `UNIQUE(courseId, userId)`).
  - A TA belongs to one or more courses.
  - Permissions are set per course, by the instructor.
- Permission keys (one enum in `packages/types`):
  - `QUESTION_BANK_VIEW`
  - `QUESTION_BANK_EDIT`
  - `EXAM_VIEW`
  - `EXAM_EDIT`
  - `MONITOR`
  - `EXTEND_TIME`
  - `RESULTS_VIEW`
  - `MARKS_ADJUST`
  - `RESULTS_PUBLISH`
  - Start with view-only defaults.
- **Enforcement:** replace `@Roles(Role.ADMIN)` with a `@RequirePermission(Permission.X)` decorator and a `PermissionGuard`.
  - The guard lets `admin` through.
  - For `ta`, it resolves the course of the resource (exam → `exam_courses` → course; question → `questions.course_id`) and checks `course_staff.permissions`.
  - Do it controller by controller. Every endpoint must name a permission, never "any staff".
- **Lists** (exams, questions, results, monitoring) must also be filtered to the TA's courses. A guard alone is not enough.
- **Accounts:** `POST /staff` creates a TA user. `POST /courses/:id/staff` and `PATCH /courses/:id/staff/:userId` assign a TA and set permissions. The UI is a "Staff" tab on the course page.
- **Login:** auth issues the JWT for TAs as well. The exam app must refuse TA login the same way it refuses admins (`ALLOW_ADMIN_ON_DESKTOP`).
- **Web:** `RequireRole` accepts `admin | ta`. Menu items are hidden by permission, using a `GET /me/permissions` that returns the permissions per course.
- **Audit:** every TA action is already logged with `actorId`. Add `ROLE`/`STAFF_*` event types.
- **Tests:** a guard spec per permission, and a "TA from another course gets 403" spec.

### 2. "Admin" → "Course Instructor" (A, S)
- UI text only: page titles, menus, empty states, emails/notifications and the login screen. Search `apps/web/src`, `packages/exam-content-ui` and notification templates for `Admin`/`admin`.
- Keep the role value `admin` in the database and JWT (see decision 1). Renaming it touches every guard and migration for no user benefit.
- Add one `roleLabel(role)` helper in `apps/web/src/lib/format.ts` so the label lives in one place: "Course Instructor", "Teaching Assistant", "Student".
- The legacy `apps/admin-web` is superseded. Leave it alone or delete it, rather than renaming it.

### 3. UI polishing (all, M)
Do this as a checklist pass, not open-ended work:
- consistent page headers and empty, loading and error states
- spacing and type scale through the existing `components/ui`
- mobile/narrow widths for the student dashboard
- keyboard focus order in the exam screen
- dark-mode contrast
- the same date/time format everywhere (`lib/format.ts`)

Pass 2 comes after the pilot, from what students and invigilators actually stumble on.

### 4. Delay / status on the student dashboard (A, S)
**Today:** `StudentExamView` has `startTime`, `endTime`, `state`, `expiresAt`. Nothing records that times changed.

**Build:**
- Add `exams.original_start_time` (set once, on publish) and `exams.schedule_note` (optional text from the instructor, e.g. "Delayed 30 min: lab network").
- `StudentExamView` gains `originalStartTime`, `rescheduled: boolean` and `scheduleNote`.
- The dashboard card shows:
  - a "Rescheduled" / "Delayed by 30 min" badge
  - the new time, with the old one struck through
  - the note
  - a live status: Upcoming · Starts in 12 min · Live · Ends in 40 min · Extended · Closed · Submitted
- Rescheduling (#5) also sends a notification through the existing `notifications` module.

### 5. Reschedule after publish (A, M)
**Today:** `ExamService.update` refuses timing changes outside DRAFT (`exam.service.ts:70`).

**Build:** `POST /exams/:id/reschedule` (`startTime?`, `endTime?`, `durationMinutes?`, `note?`), with these rules:
- SCHEDULED, or ACTIVE with no attempts started: any change, as long as the result is valid (`start < end`, and `duration` fits in the window).
- ACTIVE with attempts started: `endTime` can only move later. `startTime` and `duration` are locked. Running attempts keep their `expiresAt`; to give them more time, use extensions (#15).
- CLOSED: refuse.

It also:
- writes an audit event `EXAM_RESCHEDULED` with the old and new times
- notifies registered students
- sets `original_start_time` (from #4) if it isn't set already

**UI:** a "Reschedule" button on the exam page, with a dialog that explains the rules for the current state.

### 6. Warnings for unsubmitted code (B + C, S)
**Today:** coding drafts are saved as answers (`CodingRenderer` → `saveAnswer`). Submit stores a `code_submissions` row (`isFinal`). The exam UI doesn't connect the two.

**Build:**
- **Store:** the exam store keeps `codeSubmittedAt[questionId]` and `codeDirtySinceSubmit[questionId]`.
  - Set them from the submit response, and from `GET /attempts/:id/code/submissions` on load (add this endpoint: the latest submission per question, with no test data).
  - Typing after a submit marks the question dirty again.
- **Save & Next** (`NavigationControls`): on a coding question with no submission, or a dirty one, show a dialog:
  > "You have not submitted your code for this question. Your progress is saved, but unsubmitted code is not graded."

  Buttons: **Submit now** · **Continue without submitting**.
  - Dismissing it moves on. The student can come back, finish and submit later.
- **Finish exam** (`SubmitConfirmationModal`): show a summary:
  - answered X of Y MCQs
  - coding: submitted A, not submitted B (with links to them)
  - marked for review: C
  - The Finish button stays enabled. It is a warning, not a block.

The wording depends on decision 2.

### 7. Green only after Submit (B + C, S)
- Add `QuestionState.SUBMITTED` (or derive it): for CODING, "answered" means "has a submission that hasn't changed since". Typing only makes it "In progress".
- **Palette** (`QuestionPalette.tsx`):
  - new amber colour for "In progress (not submitted)"
  - green only for submitted
  - "submitted + changed since" shows amber again
  - update the legend
- **Counts:** the header and Finish counts use the same derived state, so they always agree with the palette.

### 8. Clear coding errors (B, M)
**Today:**
- verdicts are `PASSED | WRONG_ANSWER | RUNTIME_ERROR | TLE | MLE | OLE | INTERNAL_ERROR`
- there is no compile step
- stderr is passed through raw

**Build:**
- Add `TestCaseVerdict.COMPILATION_ERROR`, plus `errorKind` on the run result:
  - `SYNTAX`
  - `INDENTATION`
  - `NAME`, `TYPE`, `INDEX`, `ZERO_DIVISION`, … (Python)
  - `SEGFAULT`
  - `ABORT`
  - `STACK_OVERFLOW`
  - `EXCEPTION` (Java)
  - `OTHER`
- **Detection**, in a new `execution/error-classifier.ts` (pure function, unit-tested):
  - **Python:**
    - parse the last traceback line (`IndentationError`, `SyntaxError`, `NameError`, …)
    - report the line number relative to the student's file
    - optionally run `python3 -m py_compile` first, so syntax errors show before any test runs
  - **C/C++:**
    - a compile step (see #16) with gcc/g++ diagnostics, trimmed to the first few errors
    - at runtime: exit signal 11 → segmentation fault, 6 → abort (`assert`), 8 → floating-point error (divide by zero)
    - the harness already gets the exit code: a negative code from `subprocess` is the signal
  - **Java:** `javac` errors → compilation error. At runtime, the exception class from `Exception in thread "main" java.lang.X` (StackOverflowError, ArrayIndexOutOfBounds, …).
- **UI** (`packages/exam-content-ui/src/coding/RunResults.tsx`): a clear title ("Compilation error", "Indentation error on line 7", "Segmentation fault: invalid memory access") with a one-line hint, then stderr in a collapsible block.
  - For hidden tests, show only the verdict and kind, never the input (unchanged rule).
- **Desktop runner:** `apps/exam-client/src/main/runner/localRunner.ts` uses the same classifier. Move it to a shared package so both use one copy.

### 9. Students see their submitted answers (A + B, M)
**Today:**
- `GET /me/dashboard` lists exams and published results
- `GET /me/exams/:examId` is for the instructions screen
- there is no student view of past answers

**Build:**
- `GET /me/exams/:examId/submission` (student, own attempt, only after SUBMITTED/AUTO_SUBMITTED).
- It returns, per question:
  - the public question (built field by field like `getPublicQuestionsForExam`, **with no `isCorrect`**)
  - the student's selected options or text
  - for coding: the final submitted code and language
- **Before results are published:** answers only, no marks or correct answers.
- **UI:** clicking a submitted exam on the dashboard opens a read-only review page that reuses the question renderers in read-only mode.
- Optionally, an instructor setting "allow students to review answers before results" (default on).

### 10. Full analysis after results are published (A + B, M)
Same endpoint as #9. Once `results.published = true`, it also returns, per question:
- **marks:** `question_scores.score / maxScore`
- **MCQ:** the correct options, which of the student's were wrong, and the explanation (`questions.explanation` exists)
- **Coding:** passed/total per test; sample tests in full; hidden tests verdict-only (or in full, if the instructor turns on "reveal hidden tests after results"); the error kind from #8
- **why marks were cut:** "wrong option chosen", "2 of 8 tests failed (TLE ×1, WA ×1)", "adjusted by instructor: −2, reason …" (from #13)
- **exam-level:** total, percentage, pass/fail (if #11 is on), and rank/percentile (optional, per exam)

Answer keys go out only on this path, and only after publishing. Add a spec that requests it before publishing and expects no `isCorrect`.

### 11. Pass mark on/off (A, S)
**Today:** `exams.pass_percentage int default 40` is always applied.

**Build:**
- Add `exams.pass_mark_enabled boolean default true`. Keep `pass_percentage`.
- When it's off, results and analytics show no pass/fail and no pass rate. Student views hide it.
- The pass-rate tile in `results-stats.ts` shows "—".
- One toggle in the exam form.

### 12. Captcha at exam start (A + C, S)
Students should be able to start the exam without internet access (see #17), so **don't use Google reCAPTCHA or hCaptcha**. Generate the captcha on the server:
- `POST /auth/captcha` (public, throttled) returns `{ captchaId, svg }`.
  - Use `svg-captcha` (npm, no network needed).
  - Keep the answer hashed in a short-lived table, or in memory with a 2-minute TTL.
  - One use per captcha.
- `POST /auth/exam-launch` (browser, before the app opens) requires `captchaId + captchaAnswer`. Optionally `/auth/login` for students too.
- Wrong answer → 400 with a new captcha. 5 failures → the existing throttler.
- **UI:** the captcha image, a refresh button and the input, on the student Start-exam step.

If the college later prefers a known provider and the API server has internet access, add Cloudflare Turnstile behind the same interface. Self-hosted stays the default.

### 13. Manual mark adjustment (A + B, M; after #1)
**Today:**
- `PATCH /submissions/:attemptId/result` overrides the *total*
- `question_scores` has `source AUTO_MCQ | AUTO_CODE | MANUAL`, but nothing writes `MANUAL`

**Build:** per-question adjustment, keeping the automatic score intact.
- Add `question_scores.auto_score`, `manual_adjustment` (+/−), `adjusted_by`, `adjusted_at` and `adjust_reason` (required).
  - Final `score = clamp(auto_score + manual_adjustment, 0, maxScore)`.
  - Re-grading (`result-recalculation`) updates only `auto_score`, so manual changes survive a re-grade.
- `PATCH /results/attempts/:attemptId/questions/:questionId/score` (`{ adjustment | score, reason }`) recomputes the total through `ResultTotalsService`.
- **Who:** the admin always; a TA only with `MARKS_ADJUST` on that course (#1). Optionally, publishing stays instructor-only.
- **Audit:** `SCORE_ADJUSTED` with the old and new values.
- **UI:** an "Adjust" control per question on the attempt's question-wise view, showing "auto 6 · adjusted +2 → 8" and the reason. The student analysis (#10) shows the reason.
- Retire the total-override, or keep it as "bonus marks" stored the same way.

### 14. Question bank by topic and type (B, M)
**Today:**
- `topics` (optional per course) and `questions.topic_id` exist
- the bank filters by `topicId`, `type`, `difficulty`, `tag`, `courseId` and search

**Build:**
- **UI:** the bank page gets a left topic tree (DP, Graphs, Arrays, …). Each topic has a count and a "+ new topic" action. Inside a topic, type tabs: All · Single choice · Multiple choice · Coding · (others in `QuestionType`), with counts.
- **API:** `GET /question-bank/topics` returns `{ id, name, counts: { [type]: n } }` from one grouped query.
- **Topic structure:** optional `topics.parent_id` for sub-topics (Graphs → BFS/DFS). Only if you want deeper nesting.
- **Filter fixes:** add a spec per filter, and their combinations:
  - topic + type + difficulty + search + tag, with paging
  - a filter change resets to page 1
  - filters live in the URL query, so back/refresh keep them
  - "no topic" is its own filter (`topicId=none`)
  - `excludeExamId` still applies in the "add to exam" picker
- **Create flow:** a topic is required (or explicitly "Uncategorised"). The seeded questions already use "Python basics".

### 15. Per-student time extension (C, S: mostly exists)
**Today:**
- `ExtendTimeDto.studentId` is supported by the API (`extension.service.ts`)
- Monitoring has a per-student "Extend" action on each attempt row (`MonitoringPage.tsx:158`)
- So individual extension already works for students *who have started*

**Close the gaps:**
- Extend a student who **hasn't started yet** (an accommodation set in advance). Check that `TimerService` adds the student's extension minutes when it computes `expiresAt` at start, not only `pushRunningAttempts`. Add it if missing, with a spec.
- Put the per-student action where instructors look for it, too: the exam's Students/Registrations tab, not only live Monitoring.
- Show the student's extension on their dashboard (#4) and the exam timer ("+15 min added").

### 16. C, C++ and Java (B, L; images at deployment)
**Today:**
- `CodeLanguage` is only `python`
- `language.registry.ts` already says "adding a language = one entry here + an image"
- the in-container harness is Python and runs one command per test

**Build:**
- `CodeLanguage.C | CPP | JAVA`, with a registry entry for each:
  - **C:** `gcc:14` image (plus python3 for the harness), `/tmp/main.c`, `compileCommand: ['gcc','-O2','-std=c17','-o','/tmp/main','/tmp/main.c','-lm']`, `runCommand: ['/tmp/main']`
  - **C++:** same with `g++ -std=c++17`, `/tmp/main.cpp`
  - **Java:** `eclipse-temurin:21-jdk` image, `/tmp/Main.java` (the class must be `Main`), `javac`, then `java -Xss64m -Xmx{mem}m -cp /tmp Main`
- **Harness:** add an optional compile phase, run once before the tests, with its own time limit (~10 s).
  - A compile failure → every test `COMPILATION_ERROR`, plus the compiler output.
- **Limits:** Java needs a higher memory limit and a time multiplier (e.g. 2× time). Make that a per-language factor in the registry.
- **Authoring:**
  - `allowed_languages` already exists on `coding_problems`
  - the editor shows a language picker restricted to it
  - starter code per language (`StarterCode` is already per-language)
  - the reference solution can be in any allowed language
  - `coding-validation.service` validates the tests in each allowed language
- **Monaco:** add `c`, `cpp`, `java` to `monacoSetup.ts` (bundled locally, so this works offline).
- **Desktop runner (C):** the lab image needs `gcc`, `g++` and a JDK installed, and bubblewrap must allow the compile step to write `/tmp`. Add these to `infra/linux-kiosk`.
- **Deployment:** build or pull the three images on the grading server, and pin them by digest (`RUNNER_*_IMAGE`). Without them, grading of those languages returns `INTERNAL_ERROR`. That is why this can only be finished at deployment.

### 17. Intranet support (A + C + ops, M)
**Goal:** the whole exam works with the college LAN cut off from the internet.

**What the system already does:**
- the web app is a static Vite build
- Monaco and fonts are bundled (no CDN references found in `apps/web`)
- the API, Postgres and the Docker grader can run on one machine

**Deployment (ops):**
1. **One exam server on the LAN.** Static IP, a hostname in the college DNS (e.g. `exam.college.local`).
   - Runs Postgres, the API (NestJS, 2+ processes behind nginx) and the grader's Docker images pre-pulled.
   - nginx serves the built `apps/web` and proxies `/api` to the API on the same origin. That also removes most CORS setup.
2. **TLS** with a certificate from a college internal CA (or self-signed), installed on lab machines. Service workers, secure cookies and the clipboard API need HTTPS.
3. **Time.** All machines sync to an internal NTP server. Only the server clock decides, but students see times.
4. **Packages and images** come from an internal registry/mirror (Docker registry, npm mirror) or are copied in as tarballs (`docker save` / `docker load`).
5. **Firewall:** lab VLAN → exam server on 443 only. During exams, block the lab VLAN's internet access, which is an anti-cheating bonus.
6. **Capacity:** size for the largest lab, e.g. 300 students. Load-test the answer save, heartbeat and code-run endpoints (k6) before the first real exam. That is the "after" part.

**Code changes (can do now):**
- **API:**
  - the API URL comes from runtime config, not only build time: `VITE_API_BASE_URL=/api`, so the same build works on any host
  - `main.ts` gets `setGlobalPrefix` behind an env flag, *or* nginx strips `/api`
  - `app.set('trust proxy', 1)` behind nginx, so the throttler and audit see real student IPs, not nginx's
- **Exam app** (`apps/exam-client`): the server URL is configurable at install time, e.g. `/etc/secure-exam/config.json` → `apiBaseUrl`, instead of a constant. Packaged builds load `app://exam` and call `https://exam.college.local/api`.
- **Optional IP allow-list:** `EXAM_ALLOWED_CIDRS` (e.g. `10.20.0.0/16`), checked by the `DesktopClientGuard` path, so attempts can only be started from lab subnets.
- **No external calls:** captcha self-hosted (#12); no Google fonts or analytics; email notifications optional (an internal SMTP relay, or in-app only).
- **docker compose for production:** fix the known Dockerfile problems in CLAUDE.md (build `packages/*`, copy them, `DATABASE_URL=postgres:5432`) and add an nginx service. That gives a one-command install on the exam server.
- **Backups:** a nightly `pg_dump` to another machine.

### 18. Continue on another device (C, M)
**Already there:**
- **Timing:** `attempts.expiresAt` is decided by the server clock. A new device reads it and the countdown continues from the true remaining time.
- **Resume:** starting again returns 409, then `GET /attempts/current?examId=` resumes the same attempt (`startOrResumeAttempt.ts`).
- **Answers:** `useAnswer` loads the server's saved answers first, then the device's offline copy. Every MCQ choice and code draft is pushed to the server by the sync engine.
- **Coding submissions:** stored on the server.

So switching device already continues **everything that reached the server**.

**Gaps to close:**
1. **Answers not yet synced when the old device dies are lost.**
   - Keep the sync interval short (it already pushes per answer).
   - Show "All changes saved / N unsaved" prominently (the `useSyncStatus` data exists), so students and invigilators know before a switch.
   - Nothing can recover data that never left a dead machine.
2. **Review marks and position are device-only.** Save "marked for review" and the last open question on the server: add `answers.marked_for_review` and `attempts.lastQuestionId`, sent with the existing answer save and heartbeat.
3. **Two devices at once.**
   - Add `attempts.activeSessionId`. Every exam-app launch (`/auth/exam-launch/redeem`) for an in-progress attempt gets a new session id. Requests carrying an old one get 409 `SESSION_MOVED`, and the old device locks with "This exam was opened on another device."
   - With **invigilator approval** (decision 3), the redeem for an IN_PROGRESS attempt waits until an invigilator clicks "Allow device change" in Monitoring.
   - Log it as a security event `DEVICE_CHANGED`.
4. **Paused time while switching.** The time keeps running (it is the server clock). If the college wants switch time refunded, the invigilator uses a per-student extension (#15).
5. **Run code / drafts.** The new device fetches the latest submission per question (endpoint added in #6) to show "submitted" state correctly.

**Proof:** the code goes in now. A lab rehearsal confirms it: kill a machine mid-exam, log in on another, check the answers, timer and submitted state.

## 4. Cross-cutting

- **Migrations:** every entity change above needs a migration (see CLAUDE.md → Database). Expect about 8 migrations:
  - `course_staff`, the `users.role` enum value, exam schedule fields, `pass_mark_enabled`, `question_scores` adjustment fields
  - `topics.parent_id` (optional), `answers.marked_for_review` + `attempts.lastQuestionId` + `activeSessionId`, `captchas` (optional)
- **Shared types first:** add the enums and DTOs to `packages/types` and `packages/validation` first, in one small PR, so A, B and C can build in parallel.
- **Security invariants to keep:**
  - answer keys only after publishing (#9, #10)
  - hidden test inputs never sent to students (#8)
  - every new route declares a permission (#1)
- **Tests:**
  - every new endpoint gets a spec, including a "student/TA of another course gets 403" case
  - the exam UI changes (#6, #7) get Vitest tests in `apps/web`
