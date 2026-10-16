# Person B Plan: Question Bank, Python Code Editor, Question-wise Results

Owner: **Person B**. This plan narrows `phase4_improvements_electron_kiosk_codeeditor_plan.md` (the full design) and `9_day_plan_windows_linux_kiosk.md` (the schedule) down to B's work only, and adjusts them to fit the code as it exists today.

Nothing here changes A's or C's scope. Where B needs something from them, it is listed under [Asks of A and C](#5-asks-of-a-and-c).

---

## 1. What B delivers

| # | Feature | P0 (must ship) | P1 (if time) |
|---|---|---|---|
| 1 | **Question bank** | Course / topic / difficulty / status / tags on questions; search + filter + pagination; create/edit form for MCQ and CODING; existing CSV import extended; "Add to exam" dialog (multi-select from bank) | Duplicate question; export; rule-based random pick (deferred) |
| 2 | **Python code editor** | Coding problem authoring (statement, starter code, test cases with sample/hidden + weights, limits); sandboxed Docker runner; Run (custom stdin), Run samples, Submit (hidden tests, partial score); Monaco editor bundled locally; draft autosave (offline-safe); grading at attempt end → `ScoreRecorder` | "Validate reference solution" for authors; per-exam editor hardening toggles (paste block, no autocomplete) |
| 3 | **Question-wise results** | `QuestionsTab` in A's results page: students × questions matrix (not answered / answered / correct / wrong / partial), per-student drill-down, view submitted code + test results | Per-question stats (accuracy, avg score, option distribution, test pass rates) |

---

## 2. Where B starts from (current code)

- **Questions** (`apps/api/src/modules/question/`): `QuestionEntity` (`text`, `type`, `marks`, `negative_marks`, `explanation`), `OptionEntity` (`is_correct`), `ExamQuestionEntity` (`exam_id`, `question_id`, `order`). Snake_case columns via `name:`. Admin-only controller already supports CRUD, options, add/remove/reorder in exam, CSV import.
- **Question types:** `MCQ_SINGLE`, `MCQ_MULTI`, `TRUE_FALSE` (`packages/types/src/question.types.ts`). B adds `CODING`.
- **Admin UI:** Next.js pages under `apps/admin-web/src/app/(protected)/questions/` + `components/question/`. These will be **rebuilt** in `apps/web/src/features/question-bank/` (A's new SPA), not ported.
- **How answers and scores flow today (C's code, important for B):**
  - `QuestionLookupAdapter` (`answer/question-lookup/question-lookup.adapter.ts`) maps question type → `answerFormat` (`SINGLE_CHOICE | MULTIPLE_CHOICE | TEXT`). **Unknown types fall through to `SINGLE_CHOICE`**, so a CODING question would be scored as an MCQ with no correct option.
  - `computeScore` in `submission.service.ts` sets `needsManualReview` for `TEXT`.
  - `getPublicQuestionsForExam` builds the student question field by field; it has no slot for coding data yet.
  - `SaveAnswerDto.textResponse` already exists (max 10,000 chars), saved through the locked attempt path and C's offline sync engine.
- No event emitter, no Redis, no `apps/web`, no `QuestionScore` yet. Those come from the Day-1 contract session (A/C).

---

## 3. Design decisions (B's, with reasons)

These deviate slightly from the big plans where the current code makes a simpler path available.

| # | Decision | Why |
|---|---|---|
| D1 | **Code drafts are saved as the answer's `textResponse`** through the existing `saveAnswer()` / sync engine, not via new `saveCodeDraft()` methods on `IOfflineStore`. | Offline persistence, retry, locking and "latest draft" all exist already. Removes B's dependency on C's `IOfflineStore` v2. Only Python exists now, so the language doesn't need storing per draft; if a second language arrives, the draft becomes a small JSON `{lang, code}`. |
| D2 | **Code size cap = 10,000 chars** for MVP (matches `SaveAnswerDto`). | Enough for an exam answer (~250 lines); avoids changing C's DTO. Raise later if needed. |
| D3 | **Run and Submit are synchronous HTTP calls** (`POST` waits for the result, ≤ ~10 s), behind an in-process limiter (`p-limit`, `RUNNER_MAX_CONCURRENCY`, default 4) + one-run-per-student lock + throttler. No queue/polling. | 9-day plan already drops Redis/BullMQ. Polling adds a table + endpoint + client loop for no benefit at pilot scale. `ExecutionProvider` keeps the door open for Judge0 + queue later. |
| D4 | **Runner = Docker-per-run** (`DockerRunnerProvider`), spawned with `docker run` via `child_process` (no dockerode). Submit runs **all tests in one container** using a small harness that executes the student code once per test input with a per-test timeout and returns raw outputs as JSON. **Expected outputs never enter the container**; comparison happens in the API. | One container start per submit instead of per test. Keeping expected outputs outside means a student program that tampers with the harness can't learn or fake hidden answers. |
| D5 | **Freeze-on-publish via edit lock, not snapshots (MVP).** A question attached to any exam that is not DRAFT can't be edited or deleted; the bank offers "Duplicate" instead. `ExamQuestionSnapshot` is deferred. | Snapshots only help if the student/grading paths read them, which means changing C's adapter too. The lock gives the same guarantee (a live exam can't change) with B-only code. |
| D6 | **Matrix reads `QuestionScore`** (A's table). Until A's real `ScoreRecorder` lands, B's analytics computes MCQ correctness directly from `answers` + `options` (B owns options) behind the same service method. | Keeps "single source for analytics" while B isn't blocked by A. |
| D7 | Output comparison modes: `EXACT`, `TRIM` (default: trim trailing whitespace per line + trailing newlines), `TOKENS` (whitespace-insensitive). | Covers typical judges; "TRIM" avoids failing students on a stray newline. |

---

## 4. Data model (B's migrations, all new files, snake_case columns)

Timestamps placed after A's Course/Registration migrations (agree on the exact range at the contract session, e.g. `1760000100000+` for B).

| Table | Columns | Notes |
|---|---|---|
| `questions` (alter) | `course_id uuid null`, `topic_id uuid null`, `difficulty enum(EASY,MEDIUM,HARD) null`, `status enum(DRAFT,READY,ARCHIVED) default READY` | `course_id` refers to A's `courses.id` by ID only. Add `CODING` to the question type enum. |
| `topics` | `id`, `course_id null`, `name`, unique(`course_id`,`name`) | |
| `question_tags` | `question_id`, `tag varchar(50)`; PK both | Lowercased free-form tags. |
| `coding_problems` | `question_id` (PK, FK → questions, cascade), `statement_md text`, `starter_code jsonb {python: "..."}`, `allowed_languages text[]`, `time_limit_ms int default 2000`, `memory_limit_mb int default 256`, `comparison_mode enum`, `reference_solution text null` | `questions.text` stays the short title; the statement lives here. |
| `coding_test_cases` | `id`, `question_id`, `input text`, `expected_output text`, `is_sample bool`, `weight int default 1`, `order int` | Hidden cases (`is_sample=false`) never leave admin endpoints. |
| `code_runs` | `id`, `attempt_id`, `question_id`, `student_id`, `kind enum(CUSTOM,SAMPLES)`, `language`, `code`, `stdin`, `status`, `stdout`, `stderr`, `time_ms`, `created_at` | Audit/debug trail of Run clicks; output capped. |
| `code_submissions` | `id`, `attempt_id`, `question_id`, `student_id`, `language`, `code`, `status`, `passed int`, `total int`, `score float`, `max_score float`, `results_json jsonb`, `is_final bool default false`, `created_at` | `is_final` marks the one that counted for marks. |

Every entity goes into `CodingModule`/`QuestionBankModule` `forFeature` **and** `src/database/data-source.ts`.

---

## 5. Asks of A and C

Raise these at the Day-1 contract session; each is small.

**From C (attempt/answer owner):**
1. `QuestionAnswerFormat` gets `'CODE'`. `QuestionLookupAdapter` maps `QuestionType.CODING → 'CODE'` (and should map unknown types to `TEXT`, not `SINGLE_CHOICE`). `saveAnswer` treats `CODE` like `TEXT` (accepts `textResponse`). `computeScore` **skips** `CODE` (adds marks to `maxScore`, doesn't flag manual review); B grades it.
2. `getPublicQuestionsForExam` adds an optional `coding` field built from B's new `QuestionService.getPublicCodingProblem(questionId)` (statement, starter code, limits, **sample** tests only). B writes that method; C adds the one call.
3. Emit `attempt.submitted { attemptId, examId, studentId, submittedAt }` after finalization commits.
4. A read-only `IAttemptLookupService` binding (or B writes the adapter in its own module reading `attempts` by ID): `{ id, examId, studentId, status, expiresAt }` for run/submit authorization.
5. `questionRenderers.registry.ts`: B adds one line `CODING → CodingQuestionView`.
6. Stage-3 pairing: Monaco inside Electron `app://` + CSP.

**From A (platform/results owner):**
1. `apps/web` shell, router/nav registries, UI kit (B builds pages against it).
2. `ScoreRecorder.record(attemptId, questionId, score, maxScore, 'AUTO_CODE')` interface + stub on Day 1.
3. `courses` table + list endpoint (question bank filter by course).
4. `results/tabs.registry.ts`: B adds one line for `QuestionsTab`.
5. Exam table is A's now: B's edit lock (D5) needs to read exam status, done through `ExamService`/repository read only.

---

## 6. API (all in B's folders)

**Question bank** — `modules/question-bank/` (admin only)
- `GET /questions?search=&courseId=&topicId=&difficulty=&type=&tag=&status=&page=&limit=` (extend existing list)
- `POST /questions/:id/duplicate`
- `GET|POST /topics`, `GET /questions/tags` (distinct tags for autocomplete)
- `POST /exams/:examId/questions/bulk { questionIds[] }`
- Existing `POST /questions/import` gains optional `course`, `topic`, `difficulty`, `tags` columns.

**Coding authoring** — `modules/coding/` (admin only)
- `GET|PUT /questions/:id/coding` (problem + limits + starter code)
- `GET|POST|PATCH|DELETE /questions/:id/coding/tests[/:testId]`
- P1: `POST /questions/:id/coding/validate` (runs reference solution against all tests)

**Coding during an exam** — `modules/coding/` (student, owner of attempt, attempt IN_PROGRESS and not expired)
- `POST /attempts/:attemptId/code/run { questionId, code, stdin?, mode: CUSTOM|SAMPLES }` → outputs (samples: per-test pass/fail + output)
- `POST /attempts/:attemptId/code/submit { questionId, code }` → `{ passed, total, score, maxScore, perTest: [{ index, status, timeMs }] }` (hidden tests: status only, no input/expected)
- Limits: code ≤ 10,000 chars, stdin ≤ 64 KB, throttle e.g. 10 runs + 5 submits per minute per student.

**Grading** — `coding/code-grading.service.ts` listens to `attempt.submitted`: per CODING question, take the latest `code_submission` created before `submittedAt`; if none, grade the latest draft (`answers.textResponse`) by running hidden tests; mark `is_final`; `ScoreRecorder.record(..., AUTO_CODE)`. Score = `marks × Σ(weight of passed) / Σ(weight)`. Code submit re-checks attempt status before inserting, so a submit finishing after the attempt ended doesn't count.

**Question analytics** — `modules/question-analytics/` (admin only)
- `GET /exams/:examId/question-analytics/matrix` → `{ questions[], students[], cells[studentId][questionId]: { state, score, maxScore, markedForReview } }`
- `GET /exams/:examId/question-analytics/students/:studentId` → per-question answer detail, selected options vs correct, code + test results
- P1: `GET /exams/:examId/question-analytics/questions` → accuracy, avg score, option distribution, test pass rates

Audit events (B's own constants): `QUESTION_*` (existing), `CODING_PROBLEM_UPDATED`, `CODE_SUBMITTED`, `CODE_GRADED`. Include `examId`/`attemptId` in metadata.

---

## 7. Runner (`modules/execution/`)

```
execution/
├── execution-provider.interface.ts   run({ language, code, stdin, limits }) / runBatch({ ..., inputs[] })
├── language.registry.ts              python → { image: 'python:3.12-slim@sha256:…', monacoId: 'python', file: 'main.py', cmd }
├── docker-runner.provider.ts         spawn docker run …, wall-clock kill, output cap
├── harness/run_tests.py              batch harness (runs inside the container)
└── run-limiter.service.ts            p-limit + per-student lock
```

`docker run` flags: `--rm -i --network none --memory 256m --memory-swap 256m --cpus 1 --pids-limit 64 --read-only --tmpfs /tmp:size=16m,noexec --cap-drop ALL --security-opt no-new-privileges --user 65534:65534`, code mounted read-only, Python run with `-I` (isolated mode). API kills the container after wall limit (`docker kill` by name), caps stdout/stderr at 64 KB.

Env (`common/config/env.validation.ts` + `apps/api/.env.example`, `RUNNER_` prefix): `RUNNER_ENABLED`, `RUNNER_DOCKER_BIN`, `RUNNER_PYTHON_IMAGE`, `RUNNER_MAX_CONCURRENCY`, `RUNNER_WALL_TIMEOUT_MS`.

**Abuse suite** (Jest, tagged so it only runs when Docker is available): infinite loop, memory bomb, fork bomb, outbound network, writing outside `/tmp`, reading env/secrets, huge output, `import os; os.kill(os.getppid(), 9)`. All must end as a clean TLE / MLE / RE with the API unaffected.

Security note for `docs/execution-security.md`: the API's Docker socket access is root-equivalent; production runner host must be dedicated and hold no secrets.

---

## 8. Frontend (`apps/web/src/features/`, against A's kit)

```
question-bank/
├── routes.tsx, nav.ts
├── QuestionBankPage.tsx          table + filter bar + search + pagination
├── QuestionFormPage.tsx          shared form; type switch MCQ ↔ CODING
├── components/OptionEditor.tsx, TagInput.tsx, ImportDialog.tsx
└── PickForExamDialog.tsx         used from A's exam page (exported component)
coding/
├── authoring/ProblemEditor.tsx, TestCaseTable.tsx, StarterCodeEditor.tsx
├── editor/monacoSetup.ts         local bundle via vite worker imports, no CDN
├── editor/CodeEditorPanel.tsx, ProblemStatementPanel.tsx, RunResultsPanel.tsx
├── hooks/useCodeRun.ts, useCodeDraft.ts (debounced saveAnswer)
└── CodingQuestionView.tsx        registered in C's renderer registry
results/tabs/QuestionsTab/
├── QuestionsTab.tsx, AnswerMatrix.tsx, StudentDrilldown.tsx, CodeSubmissionViewer.tsx
```

Exam-taking layout: statement | Monaco | bottom panel (custom stdin, Run, Run samples, Submit, results). Markdown rendered with a sanitizing renderer (no raw HTML). Paste-from-outside blocking via Monaco `onDidPaste` + internal-clipboard check (P1, per exam).

---

## 9. Schedule (fits the 9-day plan; B's Days 1–6)

| Day | Work | Done when |
|---|---|---|
| 1 AM | **Contract session** (all): `QuestionType.CODING`, `packages/types/src/coding.types.ts` + `question-bank.types.ts`, `ExecutionProvider` + language registry, asks in §5 agreed | Shared stubs PR merged |
| 1 PM | Migrations + entities (§4) · **Spike 1:** Python hello-world from Nest via `docker run` · **Spike 2:** Monaco rendering offline from a local bundle in `apps/web` | Both spikes pass |
| 2 | `DockerRunnerProvider` + harness · limiter + per-student lock · `POST /code/run` · abuse suite | All abuse tests contained |
| 3 | `POST /code/submit` (weights, partial score) · `attempt.submitted` grading listener → `ScoreRecorder` stub · unit tests (scoring, compare modes, auth checks, late-submit race) | Score recorded against the stub |
| 4 | Question bank API (filters, tags, topics, duplicate, bulk add, import columns, edit lock) · Question bank UI + `PickForExamDialog` | Bank usable end to end |
| 5 | Coding authoring UI · `CodingQuestionView` + `useCodeRun` + `useCodeDraft` · registry line | A student solves a Python question in the browser |
| 6 | Question analytics API · `QuestionsTab` (matrix first, then drill-down + code viewer) · freeze | P0 done against stubs |
| 7–9 | Merge (A → C → B) · swap stubs · Monaco in Electron with C · E2E scenario · `docs/execution-security.md` · bug fixes | Definition of Done in 9-day plan |

If behind, drop in this order: P1 stats → validate-reference-solution → paste blocking → duplicate. **Never drop:** bank + add-to-exam, Run/Submit/grade, matrix.

---

## 10. Testing

- **Unit (Jest, mocked repos like existing specs):** filters/pagination; edit lock on non-DRAFT exams; hidden tests never in student DTOs; compare modes; weighted partial score; grading picks last submit before `submittedAt`, else draft; ownership/status/expiry checks on run/submit; per-student lock.
- **Runner (needs Docker):** abuse suite; 50 concurrent runs stay within limiter and API stays responsive.
- **Frontend (Vitest):** `useCodeDraft` debounce + offline save through fake-IndexedDB; matrix cell state mapping.

---

## 11. Decisions and open questions

Decided (2026-10-16):
- Python pinned to **3.12** (`python:3.12-slim`, pinned by digest).
- Coding score is **partial, by test-case weight**: `marks × Σ(weight of passed) / Σ(weight)`.
- B works on branch **`feat/b-question-bank-coding`**, cut from `main` and merged into the team's integration branch on merge day.

Still open:
- `apps/web` (A's new unified SPA) doesn't exist yet. Until it does, B builds the backend first (Days 1–4 order) and keeps UI work in self-contained feature folders that drop into `apps/web` once A's shell lands.
