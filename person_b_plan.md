# Person B Plan: Question Bank, Python Code Editor, Question-wise Results

Owner: **Person B**. This plan narrows `phase4_improvements_electron_kiosk_codeeditor_plan.md` (the full design) and `9_day_plan_windows_linux_kiosk.md` (the schedule) down to B's work only, and adjusts them to fit the code as it exists today.

Nothing here changes A's or C's scope. Where B touches their code or needs something from them, it is listed under [Touch points with A and C](#5-touch-points-with-a-and-c).

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
- **How answers and scores flow today (attempt/answer code, now A's; important for B):**
  - `QuestionLookupAdapter` (`answer/question-lookup/question-lookup.adapter.ts`) maps question type → `answerFormat` (`SINGLE_CHOICE | MULTIPLE_CHOICE | TEXT`). **Unknown types fall through to `SINGLE_CHOICE`**, so a CODING question would be scored as an MCQ with no correct option.
  - `computeScore` in `submission.service.ts` sets `needsManualReview` for `TEXT`.
  - `getPublicQuestionsForExam` builds the student question field by field; it has no slot for coding data yet.
  - `SaveAnswerDto.textResponse` already exists (max 10,000 chars), saved through the locked attempt path and the offline sync engine.
- No event emitter, no Redis, no `apps/web`, no `QuestionScore` yet. There is no contract session; B stubs what it needs (see §5).

---

## 3. Design decisions (B's, with reasons)

These deviate slightly from the big plans where the current code makes a simpler path available.

| # | Decision | Why |
|---|---|---|
| D1 | **Code drafts are saved as the answer's `textResponse`** through the existing `saveAnswer()` / sync engine, not via new `saveCodeDraft()` methods on `IOfflineStore`. | Offline persistence, retry, locking and "latest draft" all exist already. Removes any dependency on a new `IOfflineStore` v2. Only Python exists now, so the language doesn't need storing per draft; if a second language arrives, the draft becomes a small JSON `{lang, code}`. |
| D2 | **Code size cap = 10,000 chars** for MVP (matches `SaveAnswerDto`). | Enough for an exam answer (~250 lines); avoids changing the answer DTO. Raise later if needed. |
| D3 | **Run and Submit are synchronous HTTP calls** (`POST` waits for the result, ≤ ~10 s), behind an in-process limiter (`p-limit`, `RUNNER_MAX_CONCURRENCY`, default 4) + one-run-per-student lock + throttler. No queue/polling. | 9-day plan already drops Redis/BullMQ. Polling adds a table + endpoint + client loop for no benefit at pilot scale. `ExecutionProvider` keeps the door open for Judge0 + queue later. |
| D4 | **Runner = Docker-per-run** (`DockerRunnerProvider`), spawned with `docker run` via `child_process` (no dockerode). Submit runs **all tests in one container** using a small harness that executes the student code once per test input with a per-test timeout and returns raw outputs as JSON. **Expected outputs never enter the container**; comparison happens in the API. | One container start per submit instead of per test. Keeping expected outputs outside means a student program that tampers with the harness can't learn or fake hidden answers. |
| D5 | **Freeze-on-publish via edit lock, not snapshots (MVP).** A question attached to any exam that is not DRAFT can't be edited or deleted; the bank offers "Duplicate" instead. `ExamQuestionSnapshot` is deferred. | Snapshots only help if the student/grading paths read them, which means changing the attempt/answer adapter too. The lock gives the same guarantee (a live exam can't change) with B-only code. |
| D6 | **Matrix reads `QuestionScore`** (A's table). Until A's real `ScoreRecorder` lands, B's analytics computes MCQ correctness directly from `answers` + `options` (B owns options) behind the same service method. | Keeps "single source for analytics" while B isn't blocked by A. |
| D7 | Output comparison modes: `EXACT`, `TRIM` (default: trim trailing whitespace per line + trailing newlines), `TOKENS` (whitespace-insensitive). | Covers typical judges; "TRIM" avoids failing students on a stray newline. |

---

## 4. Data model (B's migrations, all new files, snake_case columns)

Timestamps in B's range `1760000100000+` (tell A and C so their migrations use other ranges: e.g. A `1760000000000+`, C `1760000200000+`).

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

## 5. Touch points with A and C

**Ownership (updated 2026-10-16):** A = platform, UX, courses, publish, results, time extension, student dashboard (and so the attempt/answer code). C = Electron, kiosk, security. All three work independently with no shared stubs PR; everything merges at the end.

Because there is no contract session, **B defines its own contracts in B-owned files** and keeps every edit outside B's folders tiny and listed here, so the merge is predictable.

**Small edits B makes in A's attempt/answer code** (needed for coding questions to work end to end; list them in the PR):
1. `QuestionAnswerFormat` gets `'CODE'`. `QuestionLookupAdapter` maps `QuestionType.CODING → 'CODE'` (unknown types → `TEXT`, not `SINGLE_CHOICE`). `saveAnswer` accepts `textResponse` for `CODE`. `computeScore` adds `CODE` marks to `maxScore`, gives no MCQ credit, doesn't flag manual review; B's grader adds the code score.
2. `getPublicQuestionsForExam` adds an optional `coding` field from B's `CodingService.getPublicProblem()` (statement, starter code, limits, **sample** tests only).
3. ~~A grading hook after finalization~~ Not needed: B's `CodeGradingService` sweeps finalized attempts every 15 s (no edit to the finalize path).

Items 1–2 are **done** (Day 3) and listed in the Day 3 log below so A can review them at merge.

**What B needs from A (stubbed by B until merge):**
1. `apps/web` shell, router/nav registries, UI kit. B's UI is built as self-contained feature folders.
2. `ScoreRecorder.record(attemptId, questionId, score, maxScore, 'AUTO_CODE')`. B codes against its own `CODE_SCORE_SINK` port; today `ResultTableScoreSink` adds the code score to `results.score`. At merge, bind the port to A's recorder (one line in `coding.module.ts`). If A's results start being computed from `QuestionScore`, drop the interim sink so the score isn't counted twice.
3. `courses` table: B stores `course_id` as a plain uuid with no FK until merge.
4. `results/tabs.registry.ts` line for `QuestionsTab`; questions renderer registry line for `CodingQuestionView`.

**With C:** Monaco inside Electron `app://` under C's CSP (test together after merge).

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
└── CodingQuestionView.tsx        registered in the exam page's renderer registry
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

---

## 12. Progress log

### Day 1 (2026-10-16) — done
- **Types:** `QuestionType.CODING`, `QuestionDifficulty`, `QuestionStatus`, `Topic` (`question.types.ts`); new `coding.types.ts` (problem, test cases, run/submit request/response, verdicts).
- **Entities + migrations** (`1760000100000`–`1760000100006`): `topics`, question bank columns + `CODING` enum value, `question_tags`, `coding_problems`, `coding_test_cases`, `code_runs`, `code_submissions`. Verified on a scratch DB: up, down ×7, up again; `migration:generate` shows no differences other than constraint/index names (same as the existing migrations).
- **Runner:** `modules/execution/` — `ExecutionProvider` (`runBatch`), `language.registry.ts` (Python 3.12), in-container `harness.ts`, `DockerRunnerProvider`. One container per batch; code and harness go in via env vars, no host mount. `npm run test:runner --workspace=apps/api` (needs Docker) passes 7 checks: hello world, multi-input, runtime/syntax errors, per-input timeout, no network, no code in env. ~0.5 s per container.
- **Monaco spike** (throw-away Vite app): `monaco-editor@0.52.2` + `@monaco-editor/react@4.7.0`, rendered in headless Chrome under `script-src 'self'` CSP (no CDN). Setup to reuse in `apps/web/src/features/coding/editor/monacoSetup.ts`:
  ```ts
  import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main';
  import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
  import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
  import { loader } from '@monaco-editor/react';
  self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
  loader.config({ monaco });
  ```
  Bundle is ~875 KB gzipped, so lazy-load it on coding routes only. CSP needs `worker-src 'self' blob:` and `font-src 'self' data:`; tell C for Electron.
- Pinned image digest today: `python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1`.
- Known, not fixed (pre-existing): `questions.created_at/updated_at` entity columns are `timestamp`, migration says `timestamptz`.

### Day 2 (2026-10-16) — done
- **`POST /attempts/:attemptId/code/run`** (student, attempt owner): `{ questionId, language, code, kind: CUSTOM|SAMPLES, stdin? }`. Waits for the result. SAMPLES returns per-sample verdicts; hidden tests are never read. Every run is recorded in `code_runs` (best effort).
- **Checks, in order:** attempt owned + IN_PROGRESS + not expired (reuses the answer module's `assertAttemptIsWritable` through B's `ATTEMPT_ACCESS` port, so an expired attempt is auto-submitted exactly like an answer save) → question is in the attempt's exam → question is CODING → problem set up (else 409) → language allowed.
- **Limits:** code ≤ 10,000 chars, stdin ≤ 64 KB (`CodeRunDto`); `RunLimiterService`: `RUNNER_MAX_CONCURRENCY` containers (default 4), FIFO queue capped by `RUNNER_MAX_QUEUE` (503 beyond), one run at a time per student (429), `RUNNER_RUNS_PER_MINUTE` per student (default 20, 429). Keyed by user id, not IP. In-memory: one API instance only.
- **Grading helpers:** `coding/grading/verdict.ts` (`EXACT`/`TRIM`/`TOKENS` comparison, CRLF-normalized; status → verdict), reused by Day 3 submit.
- **Abuse suite** (`npm run test:runner`): fork bomb, 1 GB allocation, growing memory, endless output, writes outside `/tmp`, uid/env check, killing the harness, forging harness output, background process outliving the run — all contained. 20 simultaneous runs complete in ~4.4 s with ≤ 4 containers at once.
- **End-to-end (curl, scratch DB):** custom run, samples, MCQ question → 400, oversized code → 400, parallel runs by one student → 429 + 200, other student's attempt → 403.
- **Still to fix on Day 3:** a CODING question in an exam is currently listed by `GET /attempts/:id/questions` with no options and would be scored like a single-choice MCQ (0 marks) — the `'CODE'` answer-format change in §5.

### Day 3 (2026-10-16) — done
- **`POST /attempts/:attemptId/code/submit`** `{ questionId, language, code }`: runs **all** test cases (samples + hidden), partial marks by weight (`grading/scoring.ts`, 2-decimal rounding), stores a non-final `code_submissions` row, audit `CODE_SUBMITTED`. Students get `{ passed, total, score, maxScore, tests: [{ index, isSample, verdict, timeMs }] }` — no hidden inputs/outputs. Sandbox failure → 503 and nothing stored. Attempt re-checked after execution: if it ended meanwhile → 409, not counted.
- **End-of-attempt grading** (`CodeGradingService`, `@Interval` 15 s): for each finalized attempt × CODING question without a final row: last GRADED submit with `created_at <= submittedAt` → final; else the saved draft (`answers.textResponse`) run against all tests → final (`from_draft`); else 0. Final row + score in one transaction; unique partial index `UQ_code_submissions_final` (migration `1760000100007`) makes retries/races safe; sandbox failure defers to the next sweep. Audit `CODE_GRADED`.
- **Edits in A's attempt/answer code** (review at merge):
  - `question-lookup.interface.ts`: `QuestionAnswerFormat` + `'CODE'`.
  - `question-lookup.adapter.ts`: `CODING → 'CODE'`, unknown types → `'TEXT'` (was `SINGLE_CHOICE`); `getPublicQuestionsForExam` adds `coding` (statement, starter code, limits, samples) via B's `CodingContentService`.
  - `answer.service.ts`: `CODE` accepts `textResponse` (the code draft), rejects options.
  - `submission.service.ts` `computeScore`: `CODE` adds marks to `maxScore`, gives 0, doesn't set `needsManualReview`.
  - `answer.module.ts`: imports `CodingContentModule`.
  - Specs: adapter (new ctor arg, CODE/TEXT mapping, coding field), computeScore (CODE case).
- **Module split:** `CodingContentModule` (problem content; no attempt/answer imports) is imported by the answer module; `CodingModule` (run/submit/grade) imports the answer module. No cycle.
- **Shared types:** `PublicQuestion.coding?`, `HiddenTestResult.isSample`, `AuditEventType.CODE_SUBMITTED/CODE_GRADED`, `CodeSubmitDto`.
- **Tests:** 117 unit tests pass (30 in coding), Docker suite 17/17. End-to-end on a migrations-only DB, API in production mode: alice submit 4/8 counted, bob draft-only 8/8, carol nothing 0; results `maxScore` 19 (11 MCQ + 8), no manual-review flag; code submit after finishing → 409; question list includes samples only.
