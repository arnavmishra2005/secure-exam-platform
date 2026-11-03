# Phase 5 feature plan

The next round of features, checked against the code as of 3 Nov 2026. Each feature says what exists today, what to build, who owns it (A: platform, courses, publish, results, auth; B: question bank, coding, question-wise results; C: attempts, persistence, kiosk, monitoring) and how big it is (S ≈ ½–1 day, M ≈ 2–3 days, L ≈ 4+ days, XL ≈ 2 weeks split across people).

## 1. Classification

| # | Feature | Bucket | Owner | Size |
|---|---|---|---|---|
| 1 | Instructors replace admin: several instructors, each owning their courses, each choosing their TAs and the TAs' permissions | **Now** | A (+ every module owner scopes their own endpoints) | XL |
| 2 | Remove "admin" everywhere: role, routes, UI, seed, env flags, docs | **Now** (with #1) | A (+ all owners) | M |
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
| 19 | Sandbox for malicious code (server grader and lab-PC runner) | **Mostly exists** for Python: harden now; gVisor, rootless Docker and the runner host at deployment | B (server) + C (lab runner) | M |

**Buckets:**
- **Now:** application code only. It can be built and tested on a laptop today.
- **Code now, finish at deployment:** the code can be written now, but it only works end to end once infrastructure exists (Docker images, lab images, servers).
- **Deployment:** mostly configuration and infrastructure in the college network, plus a few small code changes.
- **After:** needs the system running with real users first (pilot feedback, load tests, a lab rehearsal).

**Suggested order:**
1. #1 and #2 (instructors and TAs) first. Every other feature's "who can do what" depends on them, and they touch every controller, so it's cheaper to do them before the other features add more endpoints.
2. Then the small, visible wins, in parallel: #4, #6, #7, #11, #12, #15.
3. Then #5, #8, #9, #10, #13, #14, #18.
4. In parallel, on its own track: #19, then #16 and #17. They need someone to build the images and the server setup. **C and C++ (#16) must not reach students before the #19 hardening is in**: compiled code can make raw system calls, so it needs the stronger sandbox.
5. #3 pass 2 after the pilot.

## 2. Decisions needed before building

These change what gets built, so settle them first:

Already decided: **there is no admin.** There are several instructors. Each owns their own courses and sees only those, and each chooses their own TAs and what those TAs may do (#1, #2). That leaves these questions about it:

1. **Who creates instructor accounts?** Nobody in the app can, once admin is gone. Recommendation:
   - IT (or whoever runs the server) creates them with a command-line script, `npm run user:create-instructor`. There is no web page for it, so no web account can create instructors.
   - Later, if the college wants it, add a head-of-department role that can create instructors in the web app.
2. **One instructor per course, or co-instructors?** Recommendation: allow co-instructors. A course has one or more `INSTRUCTOR` rows in `course_staff`, so two professors can share a course and its exams. The person who creates the course is its first instructor. Any instructor of a course can add another.
3. **Whose is the question bank?** Recommendation: each question belongs to the instructor who wrote it (`questions.owner_id`). That instructor can use it in any of their courses' exams. Their TAs with `QUESTION_BANK_*` permission see it. Other instructors don't. Sharing between instructors can be added later as "copy to my bank".
4. **Unsubmitted code.** `code_submissions.fromDraft` means the last *draft* is graded today when the student never pressed Submit. Feature #6 tells students "your code is not submitted", so which rule applies?
   - **(a) Unsubmitted code scores 0.** This matches the warning.
   - **(b) The draft is still graded.** This is safer for students, but then the warning should say "submit to confirm it" instead.
   - This should be a per-exam setting, defaulting to (a).
5. **Device switching.** Can a student continue on another device on their own, or only after an invigilator approves it in Monitoring? Recommendation: invigilator approval. Otherwise a second person on a second machine can take over the attempt.
6. **Rescheduling a live exam.** Can the instructor move the times while students are already writing? Recommendation:
   - before anyone starts: free to change
   - after anyone starts: only `endTime` can move later, and the change applies through extensions (#15)

## 3. Feature details

### 1. Instructors and TAs replace admin (A + every module owner, XL)
**Today:**
- `Role` is only `admin | student` (`packages/types/src/user.types.ts`).
- 19 controllers use `@Roles(Role.ADMIN)`. Any admin sees and changes everything.
- Courses, exams and questions have no owner column. Only `exam_extensions.createdBy` records who made something.
- An exam can belong to several courses (`exam_courses`). `questions.course_id` exists but is optional.

**The model:**
- **Roles:** `instructor | ta | student`. `admin` is removed (#2).
- **Courses have staff.** New table `course_staff`:
  - columns: `courseId`, `userId`, `role` (`INSTRUCTOR | TA`), `permissions` (jsonb, for TAs only), `addedBy`
  - `UNIQUE(courseId, userId)`
  - Creating a course adds the creator as its `INSTRUCTOR`.
  - An instructor of a course can add TAs, set their permissions and remove them, and can add co-instructors (decision 2).
  - A TA can be on several courses, with different permissions on each.
- **Every exam belongs to exactly one course:** new `exams.course_id`, required.
  - `exam_courses` stays for registering students from more courses. Those courses must also be taught by one of the exam's instructors.
  - "Instructor of an exam" means instructor of `exams.course_id`.
- **Questions belong to the instructor who wrote them:** new `questions.owner_id` and `topics.owner_id` (decision 3).
  - Adding a question to an exam needs access to both the question and the exam.
  - When it is shared through an exam, a TA of that course sees the question.
- **Students are global accounts, managed through courses.**
  - An instructor creates or imports students into *their own* course: `POST /courses/:id/students`, which creates the account if the college ID or email is new, otherwise enrols the existing one.
  - The student list shows only students enrolled in your courses.
  - Password resets go through the same check: you must teach the student.
- **TA permissions** (one enum in `packages/types`; the instructor ticks them per TA, per course):
  - `QUESTION_BANK_VIEW`
  - `QUESTION_BANK_EDIT`
  - `EXAM_VIEW`
  - `EXAM_EDIT`
  - `STUDENTS_MANAGE`
  - `MONITOR`
  - `EXTEND_TIME`
  - `RESULTS_VIEW`
  - `MARKS_ADJUST`
  - `RESULTS_PUBLISH`
  - New TAs get `EXAM_VIEW`, `MONITOR` and `RESULTS_VIEW`.
  - Instructors implicitly have all of them on their courses.
  - Managing staff (adding TAs, changing permissions) is instructor-only and never a TA permission.

**Enforcement:**
- One `AccessService` in `common/access/`:
  - `courseIdsFor(user, permission)`: the courses where the user has the permission
  - `assertExam(user, examId, permission)`, `assertCourse(…)`, `assertQuestion(…)`, `assertAttempt(…)`: resolve the resource's course and check the permission
  - per-request cache of the user's `course_staff` rows
- Replace `@Roles(Role.ADMIN)` with `@RequirePermission(Permission.X)` plus a `PermissionGuard`. The guard checks the permission is held on *some* course. The service then checks the specific resource through `AccessService`, because the guard can't see which course a body or query refers to.
- **Every list is scoped**, not only single reads. Exams, questions, topics, tags, students, results, monitoring, audit, submissions, analytics and notifications filter with `courseIdsFor(...)`. One query helper, `scopeToCourses(qb, alias, courseIds)`, so each module applies it the same way.
- Wrong course gives **404, not 403**, so other instructors' exam IDs can't be probed.
- **Ownership work by module:** each owner scopes their own controllers and adds the specs.
  - **A:** course, registration, publish, results, students, audit, notifications
  - **B:** exam, question, question-bank, coding, question-analytics
  - **C:** attempt monitoring, extensions, client-security, submissions (staff side)

**Accounts and login:**
- **Instructors:** created by IT with `npm run user:create-instructor -- --email … --name …` (decision 1). It prints a one-time password, and the instructor must change it on first login.
- **TAs:** an instructor creates them from the course's Staff tab:
  - `POST /courses/:id/staff` (`{ email, name, role: 'TA', permissions }`) creates the user if new, or adds an existing TA/instructor to the course
  - `PATCH /courses/:id/staff/:userId` changes permissions
  - `DELETE /courses/:id/staff/:userId` removes them
  - A TA's role on the user is `ta`. The same person can be a TA on one course and nothing on another.
- **Exam app:** refuses instructor and TA login and refresh (today: admin). `ALLOW_ADMIN_ON_DESKTOP` becomes `ALLOW_STAFF_ON_DESKTOP`.
- `GET /me/access` returns `{ role, courses: [{ courseId, code, name, role, permissions }] }`. The web app uses it to show menus and buttons.

**Data migration:**
1. Add `instructor` and `ta` to the role enum.
2. Turn every `admin` user into an `instructor`.
3. Give every existing course, exam and question an owner:
   - a course gets every former admin as an `INSTRUCTOR`, or one chosen with `MIGRATION_DEFAULT_INSTRUCTOR_EMAIL`
   - an exam gets its first `exam_courses` course, or a "Legacy" course made for orphans
   - a question gets the default instructor
4. Then drop `admin` from the enum. Postgres needs the type recreated for that.
5. The migration is reversible (`down` maps `instructor` back to `admin`).

**Tests:**
- An `AccessService` spec covers instructor, co-instructor, TA with and without each permission, another course's instructor and student.
- Every scoped list gets one spec showing another instructor's rows are excluded.
- The seed creates two instructors and a TA (#2), so the isolation can be tried by hand.

**Phasing:**
- **1a:** types, the migration, `course_staff`, `AccessService` and `/me/access`. A, 3 days.
- **1b:** each owner moves their controllers to permissions and scoping, in parallel. 2–3 days each.
- **1c:** Staff tab and permission-aware menus. A, 2 days.
- Feature work from section 1's step 2 can start once 1a is merged.

### 2. Remove "admin" everywhere (A + all owners, M)
"Admin" is not renamed. It is removed: there is no all-seeing account any more. Everything that said admin now says instructor, or means "instructor or TA with permission X".

- **Types:** remove `Role.ADMIN` and add `Role.INSTRUCTOR` and `Role.TA`. The compiler then lists every place still using it.
- **API:**
  - every `@Roles(Role.ADMIN)` changes (#1)
  - `auth.service.ts` desktop check
  - `env.validation.ts`: `ALLOW_ADMIN_ON_DESKTOP` → `ALLOW_STAFF_ON_DESKTOP`
  - audit event types and the role-check enum in the migration
  - Swagger tags and descriptions
- **Web:**
  - routes `/admin/*` → `/instructor/*`, keeping a redirect for old links
  - `AdminLayout` → `StaffLayout`, `studentAdminRoutes` → `studentManagementRoutes` and similar names
  - all visible text (page titles, menus, empty states, notifications, the login screen)
  - one `roleLabel(role)` helper in `lib/format.ts`: "Instructor", "Teaching Assistant", "Student"
  - The header shows the user's role on the current course ("Instructor · CS201" / "TA · CS201").
- **Shared package:** `packages/exam-content-ui` text.
- **Seed:**
  - `admin@secure-exam.dev` → `instructor@secure-exam.dev`, owning CS201 and the sample exam
  - add `instructor2@secure-exam.dev`, with their own course and exam, to check isolation
  - add `ta@secure-exam.dev`, a TA on CS201 with the default permissions
- **Docs:** `CLAUDE.md`, `README.md`, `docs/*` (e.g. "the API can't create an admin" becomes the instructor script).
- **Legacy `apps/admin-web`:** it is superseded by `apps/web` and would need the same permission work. Delete it in this phase rather than port it.
- **Check:** `grep -rni "admin" apps packages --include='*.ts*'` returns only migrations and the redirect.

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

The wording depends on decision 4.

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
- **Who:** the exam's instructors always; a TA only if their instructor gave them `MARKS_ADJUST` on that course (#1). Publishing needs `RESULTS_PUBLISH`, which TAs don't get by default.
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
- **Security:** compile and run happen inside the #19 sandbox. Don't enable C/C++/Java for real exams until #19's gVisor, seccomp and the new abuse tests are in.

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
   - With **invigilator approval** (decision 5), the redeem for an IN_PROGRESS attempt waits until an invigilator clicks "Allow device change" in Monitoring.
   - Log it as a security event `DEVICE_CHANGED`.
4. **Paused time while switching.** The time keeps running (it is the server clock). If the college wants switch time refunded, the invigilator uses a per-student extension (#15).
5. **Run code / drafts.** The new device fetches the latest submission per question (endpoint added in #6) to show "submitted" state correctly.

**Proof:** the code goes in now. A lab rehearsal confirms it: kill a machine mid-exam, log in on another, check the answers, timer and submitted state.

### 19. Sandbox for malicious code (B + C, M; final pieces at deployment)
Student code is untrusted. It can try to:
- read other students' answers or the hidden tests
- reach the network
- crash or freeze the grader or the lab PC
- escape to the host

Code runs in two places, and both need to hold.

**Today: server grader** (`execution/docker-runner.provider.ts`, documented in `docs/execution-security.md`):
- a fresh container per run: `--network none`, `--read-only`, a 16 MB `/tmp`, `--cap-drop ALL`, `no-new-privileges`, uid 65534, `--pids-limit 64`, memory/CPU/open-file caps, `--ipc none`, a time limit per test plus a hard container deadline, a 64 KB output cap
- expected outputs never enter the container
- `npm run test:runner` covers nine abuse cases (fork bomb, memory bombs, endless output, filesystem writes, secret reading, killing or forging the harness, background processes, network)

**Today: lab-PC runner** (`apps/exam-client/src/main/runner/localRunner.ts`):
- `bwrap --unshare-all` binds only `/usr`, `/lib*` and `/bin` read-only. There is no home folder, so the exam app's own files and tokens are invisible.
- It adds a private `/tmp`, a clean environment and `prlimit` memory/file/size caps.
- It kills the whole process group at the deadline.
- Unsandboxed mode works only in dev builds (`IS_DEV && EXAM_UNSANDBOXED_RUNNER=1`).

**Gaps and what to build: server grader (B)**
1. **A second kernel boundary.** All containers share the host kernel, so a kernel bug is an escape.
   - Run sandboxes under **gVisor** (`--runtime=runsc`), behind `RUNNER_DOCKER_RUNTIME`. It is one flag in `DockerRunnerProvider`.
   - It is required before C/C++ (#16): compiled code makes raw system calls directly.
   - Measure the start-up cost in the capacity test.
2. **A tighter seccomp profile** than Docker's default: `--security-opt seccomp=infra/runner/seccomp.json`.
   - Deny `ptrace`, `mount`, `umount2`, `unshare`, `setns`, `bpf`, `keyctl`, `add_key`, `perf_event_open`, `userfaultfd`, `personality`, `kexec_*`, `init_module`, and `socket` for any family other than `AF_UNIX`.
   - Abuse tests check that each is refused.
3. **Rootless Docker** (or `userns-remap`) on the host, so root in a container isn't root on the machine. This is already recommended in the docs; make it a checked deployment step.
   - Best is a **separate runner host** with no database and no `.env`, reached with `DOCKER_HOST=ssh://runner@…`.
4. **Compiled languages** (with #16): compile in the same sandbox, as a separate step with its own limits.
   - 10 s, 512 MB, compiler output capped, `-fmax-errors=5`, and the binary must fit in `/tmp`.
   - `/tmp` keeps `nosuid,nodev` but needs exec for the compiled binary.
   - Per-language overrides in `language.registry.ts`: Java needs a higher `--pids-limit` (JVM threads, e.g. 128) and `-XX:ActiveProcessorCount=1 -XX:+UseSerialGC -Xss…`.
5. **Hardened images** we build ourselves: `infra/runner-images/{python,c,cpp,java}/Dockerfile`.
   - minimal base, setuid bits removed (`find / -perm -4000 -exec chmod u-s {} +`), no shells or package managers beyond what the harness needs
   - pinned by digest (`RUNNER_*_IMAGE`)
6. **Leftovers and monitoring.**
   - Label every sandbox container (`--label secure-exam-runner=1`).
   - A reaper every minute removes any older than its deadline.
   - Log every run's verdict and resource use.
   - Repeated limit hits or seccomp denials from one student become a `SUSPICIOUS_CODE` security event on Monitoring. This flags only, never blocks: `import os` is legitimate in many answers.
7. **More abuse tests** (`test:runner`), one per new language:
   - C: fork bomb, `while(1) malloc`, null-pointer write, stack overflow
   - raw `syscall(SYS_ptrace…)` and `unshare`
   - compile bombs: deep template recursion, `#include "/dev/zero"`, a 1 GB static array
   - Java: thread bomb, `Runtime.exec`
   - reading `/proc/1/environ`

**Gaps and what to build: lab-PC runner (C)**
1. **No process-count cap.** `--unshare-all` gives a private PID namespace, but that doesn't limit how *many* processes there are. A fork bomb can exhaust the PC's process table before the deadline kill.
   - Run each job in a cgroup: `systemd-run --user --scope -p TasksMax=64 -p MemoryMax=<limit> -p CPUQuota=100% -- bwrap …`. Ubuntu 22.04+ delegates the user cgroup.
   - Refuse to run when the cgroup can't be created, the same way a missing `bwrap` is refused.
2. **`prlimit` is optional today.** If it's missing, the job runs without memory limits. Make it required, like `bwrap`.
3. **`/tmp` has no size cap.** `bwrap --tmpfs` is RAM-backed, and `prlimit --as` doesn't count it, so `while True: f.write(…)` fills the PC's memory.
   - The cgroup `MemoryMax` from item 1 does count tmpfs pages, so it closes this.
   - Where the lab's bwrap is new enough (`--size` arrived in 0.10; check the Ubuntu version's package), also add `--size 16M` before `--tmpfs /tmp`.
4. **No seccomp filter.** Pass `--seccomp <fd>` with a filter compiled at build time (libseccomp), using the same deny list as the server.
5. **Lab image** (`infra/linux-kiosk`): pin `bubblewrap`, `util-linux`, `python3.12`, and with #16 `gcc`, `g++` and a JDK. Check at app start-up that the sandbox works (a self-test run), and show "Code runner unavailable, tell the invigilator" otherwise. The student can still Submit; it runs on the server.
6. **Non-Linux lab machines:** no sandbox exists, so the app never runs code locally there. Run falls back to the server (`CODING_SERVER_RUN=true` for those labs). The dev-only unsandboxed mode stays dev-only.

**Bucket:** items 2, 4, 5, 6 and 7 (server) and 1–4 (lab) are code that can be done now. gVisor, rootless Docker, the separate runner host and the lab-image packages are **deployment**: write them as checklists in `docs/execution-security.md` and `infra/`, and tick them on the real machines.

## 4. Cross-cutting

- **Migrations:** every entity change above needs a migration (see CLAUDE.md → Database). Expect about 10 migrations:
  - the role change (`admin` → `instructor`, plus `ta`, with the data migration in #1), `course_staff`, `exams.course_id`, `questions.owner_id` + `topics.owner_id`
  - exam schedule fields, `pass_mark_enabled`, `question_scores` adjustment fields
  - `topics.parent_id` (optional), `answers.marked_for_review` + `attempts.lastQuestionId` + `activeSessionId`, `captchas` (optional)
- **Shared types first:** add the enums and DTOs to `packages/types` and `packages/validation` first, in one small PR, so A, B and C can build in parallel.
- **Security invariants to keep:**
  - answer keys only after publishing (#9, #10)
  - hidden test inputs never sent to students (#8)
  - every route declares a permission, and every list is scoped to the user's courses (#1)
  - another instructor's data answers 404, not 403 (#1)
  - student code runs only in a sandbox; no unsandboxed path in packaged builds or production (#19)
- **Tests:**
  - every new endpoint gets a spec, including an "instructor/TA of another course gets 404" case
  - `test:runner` grows with each language and each sandbox control (#19)
  - the exam UI changes (#6, #7) get Vitest tests in `apps/web`
