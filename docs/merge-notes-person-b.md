# Merge notes: Person B, Phase 5

Branch `phase5/person-b`. This lists everything in B's Phase 5 work that touches **Person A's or
Person C's code, a shared file, or behaviour the others rely on**, so that conflicts can be
resolved from this page. B-only changes are listed briefly at the end.

Features (`phase5_feature_plan.md`): **#8** clear coding errors, **#14** question bank by topic and
type (with a card layout), **#19** sandbox hardening, **#16** C, C++ and Java, **#13** manual mark
adjustment (admin only for now; permissions come with A's #1).

Contents:
1. [Migrations](#1-migrations)
2. [Files owned by Person A](#2-files-owned-by-person-a)
3. [Files owned by Person C](#3-files-owned-by-person-c)
4. [Shared packages and barrels](#4-shared-packages-and-barrels)
5. [After A's #1 (roles and permissions)](#5-after-as-1-roles-and-permissions)
6. [Behaviour changes others should know](#6-behaviour-changes-others-should-know)
7. [Where conflicts are likely, and how to resolve them](#7-where-conflicts-are-likely-and-how-to-resolve-them)
8. [Open items](#8-open-items)
9. [B-only changes (for reference)](#9-b-only-changes-for-reference)

---

## 1. Migrations

B's Phase 5 range is `17941000…` (A: `17940000…`, C: `17942000…`). All have a working `down()`.

| File | Table (owner) | What |
|---|---|---|
| `1794100000000-B-AddCompilationErrorStatus.ts` | `code_runs` (B) | Adds `COMPILATION_ERROR` to `code_runs_status_enum` (#8) |
| `1794100000001-B-AddReferenceLanguage.ts` | `coding_problems` (B) | `reference_language varchar(20) default 'python'` (#16) |
| `1794100000002-B-AddQuestionScoreAdjustments.ts` | **`question_scores` (A)** | `autoScore`, `manualAdjustment` (default 0), `adjustedBy`, `adjustedAt`, `adjustReason`; backfills `autoScore = score` (#13) |

The third one alters A's table; only columns are added, and nothing existing changes. If A also
changes `question_scores` in their range, both apply in order (A's `17940…` first).

C, C++ and Java need no enum migration: languages are stored as text
(`coding_problems.allowed_languages text[]`, `code_runs.language`, `code_submissions.language` varchar).

## 2. Files owned by Person A

### `apps/api/src/modules/results/entities/question-score.entity.ts` (#13)
Five **added** columns at the end, in a marked block:

```ts
autoScore: number | null;       // automatic score; null on rows from before #13
manualAdjustment: number;       // default 0
adjustedBy: string | null;      // users.id
adjustedAt: Date | null;
adjustReason: string | null;    // varchar(500), required by the API when adjusting
```

Rule: **`score = clamp(autoScore + manualAdjustment, 0, maxScore)`** whenever an adjustment is set.

### `apps/api/src/modules/results/score-recorder.service.ts` (#13)
Two small additions in `write()`, both commented "Person B (#13)":
- The upsert also writes `autoScore: input.score` (and lists `autoScore` in `orUpdate`).
- After the upsert, a one-statement `UPDATE … SET score = LEAST(GREATEST("autoScore" + "manualAdjustment", 0), "maxScore") WHERE "attemptId" = $1 AND "manualAdjustment" <> 0`.

**Why:** re-grading (MCQ grading, `/results/…/recompute`, code grading) must not undo a manual
adjustment. **Keep both lines** if `ScoreRecorderService` is rewritten.

### `apps/api/src/common/config/env.validation.ts` and `apps/api/.env.example`
Only additions, in B's `RUNNER_*` block:

| Variable | Feature |
|---|---|
| `RUNNER_GCC_IMAGE`, `RUNNER_JAVA_IMAGE` | #16 |
| `RUNNER_REQUIRE_GVISOR_FOR_COMPILED` | #16 |
| `RUNNER_DOCKER_RUNTIME`, `RUNNER_SECCOMP_PROFILE`, `RUNNER_FLAG_LIMIT_BATCHES` | #19 |

### `docs/analytics-data-contract.md` (A's doc)
Updated three places:
- **Coding questions:** they can be in four languages.
- **Manual changes:** the new per-question adjustment, with the legacy total override kept and described.
- **Stub columns:** `violationCount` is real now, and `SUSPICIOUS_CODE` events count in it.

### The total override (`PATCH /submissions/:attemptId/result`, C's controller, A's data)
Not changed. It still overrides `results.score` directly, and the next recompute or recalculation
replaces it, as before. The plan suggests either retiring it in favour of per-question adjustments
or keeping it as "bonus marks". **That decision is open (A/C).**

### Not touched
`app.module.ts` and `data-source.ts`. #13 adds no new entity: it reuses A's `QuestionScoreEntity`,
registered additionally in B's `QuestionAnalyticsModule` through `TypeOrmModule.forFeature`.

## 3. Files owned by Person C

### `packages/validation/src/answer.schema.ts` (#16), one line
`SaveAnswerDto.textResponse` max length goes from `10000` to `CODE_DRAFT_MAX_LENGTH` (10,032, from
`@secure-exam/types`).

**Why:** a coding draft is now saved as the code plus a one-line language header (see §6).

### `apps/exam-client/src/main/runner/localRunner.ts` (#19, #16), largely rewritten
Agreed with the user: B wrote it; C reviews it at merge.

- **#19 sandbox:**
  - Every run goes `systemd-run --user --scope` (TasksMax 64, MemoryMax, CPUQuota 100 %) → `prlimit` → `bwrap … --seccomp 3`.
  - `bwrap`, `prlimit` and `systemd-run` are all required.
  - `/tmp` gets a size cap where bubblewrap ≥ 0.10.
  - A self-test (`checkSandbox()`) checks that the cgroup limits apply, a program runs, and `ptrace` is killed. If it fails, every Run is refused with an "invigilator" message.
- **#16 languages:**
  - `LocalRunJob.language` is `'python' | 'c' | 'cpp' | 'java'`, and `'COMPILATION_ERROR'` is a new status.
  - C, C++ and Java compile once in the sandbox (job folder writable at `/work`), then each input runs read-only from `/sandbox`.
  - Flags, time factors and memory overheads match the server.
  - Unsandboxed development mode (macOS) refuses compiled languages, so the view falls back to the server.
- **New file:** `seccompFilter.ts`, which generates the BPF program in TypeScript (x64 and arm64), so no native library ships.
- **Tests:** `apps/exam-client/test/runnerSandbox.test.mjs`. One of them fails if the lab-PC deny list differs from the server's (`infra/runner/build-seccomp.mjs`).

### `apps/exam-client/src/main/ipc/channels.ts` (#19)
The `RUN_CODE` handler is unchanged. On Linux, the app also calls `checkSandbox()` once at start-up
and logs `[runner] …` if the sandbox doesn't work.
**Ask C:** optionally show this as a readiness check.

### `infra/linux-kiosk/setup-exam-kiosk.sh` and `rollback-exam-kiosk.sh` (#19, #16)
Setup gains step "2b":
- Installs `bubblewrap util-linux systemd python3`. Failure stops setup.
- Installs `gcc g++ libc6-dev default-jdk-headless`. Failure only warns.
- Writes `/etc/systemd/system/user@.service.d/90-secure-exam-delegate.conf` (`Delegate=pids memory cpu`).
- On Ubuntu 24.04+, adds an AppArmor profile that allows `userns` for `/usr/bin/bwrap` only.

Rollback removes the drop-in and the AppArmor profile; the packages stay installed.

### `security_events` (C's table): B writes `SUSPICIOUS_CODE` rows (#19)
- **Who writes them:** `apps/api/src/modules/execution/suspicious-code.sink.ts` (B) inserts a row of type `SUSPICIOUS_CODE` when the server sandbox sees a blocked system call, a fork bomb, harness tampering or repeated limit hits. It also writes an audit line.
- **Effect:** they count in `countByAttempt`, so they show on Monitoring and Results.
- **Deliberately not in `DESKTOP_VIOLATION_TYPES`:** only the server may report it, and the exam app must not be able to send or forge it.
- **Ask C:** add a display label for `SUSPICIOUS_CODE` in the Monitoring event list.

### Coding drafts in `answers.textResponse` (#16), which affects C's #9
A draft in C, C++ or Java starts with a hidden first line, `\u0001lang:<language>`. A draft without
it is Python, which covers every draft saved before #16.

**Ask C:** in #9 (students see their submitted answers), and anywhere else a coding answer's
`textResponse` is shown, use `decodeCodeDraft()` from `@secure-exam/types` to get
`{ language, code }`; don't show the raw text.

The offline store's `CodeDraft.language` field (`apps/web/.../offlineStore.interface.ts`) can carry
the same value if C later stores drafts separately.

### Exam view (B's `CodingQuestionView`, mounted by C's/A's exam page)
- **Host contract:** unchanged. `onSaveDraft(text)` still saves `text` as `textResponse`; the text now includes the header.
- **Local runs:** go through `window.desktop.runCode`, so the new languages reach C's runner automatically.

## 4. Shared packages and barrels

All additions; no renames or removals.

**`packages/types`**
- **`index.ts`:** one new line, `export * from './code-languages'`.
- **`coding.types.ts`:**
  - `CodeLanguage` gains `C`, `CPP` and `JAVA`.
  - `CodeErrorKind` gains `BLOCKED_SYSCALL`, `COMPILE` and `NULL_POINTER`.
  - `ExecutionStatus` and `TestCaseVerdict` gain `COMPILATION_ERROR` (#8).
  - New: `CodeErrorInfo`, `CODE_DRAFT_MAX_LENGTH`, `CodingProblem.referenceLanguage`.
- **`code-languages.ts` (new):** the language catalogue, `encodeCodeDraft` / `decodeCodeDraft`, `defaultLanguage` and `starterFor`.
- **`error-classifier.ts` (new in #8):** shared by the server and the exam UI.
- **`question-bank.types.ts`:** `NO_TOPIC`, the topic-summary types, and `allowedLanguages` / `referenceLanguage` on `CodingProblemInput`.
- **`question-analytics.types.ts`:**
  - `AnalyticsCell.autoScore` and `adjustment` (optional).
  - `DrilldownQuestion.adjustment`.
  - New: `ScoreAdjustmentInfo`, `AdjustQuestionScoreRequest`, `AdjustQuestionScoreResponse`.
- **`audit.types.ts`:** `SUSPICIOUS_CODE` and `SCORE_ADJUSTED`.

**`packages/validation`**
- **`question-bank.schema.ts`:**
  - `topicId` accepts `'none'`.
  - `CodingProblemInputDto.allowedLanguages` and `referenceLanguage`.
  - `ValidateCodingDto.language`.
  - New: `AdjustQuestionScoreDto`.
- **`answer.schema.ts`:** see §3.

**`packages/api-client`**
- `question-bank.api.ts`: `getTopicSummary`.
- `question-analytics.api.ts`: `adjustQuestionScore`.

**`packages/exam-content-ui`**: B's own package.

## 5. After A's #1 (roles and permissions)

Every B endpoint is `@Roles(Role.ADMIN)` today. When #1 lands, switch each to `@RequirePermission(…)`
and scope it to the user's courses, answering 404 for another instructor's data:

| Endpoint (controller) | Permission |
|---|---|
| `/question-bank/*`, `POST /exams/:id/questions/bulk` (`question-bank.controller.ts`) | `QUESTION_BANK_*` (view/edit) |
| `GET /question-bank/topics/summary` | `QUESTION_BANK_VIEW` |
| `POST /question-bank/validate-coding` | `QUESTION_BANK_EDIT` |
| `GET /exams/:id/question-analytics…` (`question-analytics.controller.ts`) | `RESULTS_VIEW` |
| **`PATCH /exams/:id/question-analytics/attempts/:attemptId/questions/:questionId/score`** | **`MARKS_ADJUST`** on the exam's course; instructors always, TAs only if granted. |
| `POST /exams/:id/question-analytics/recalculate` (`result-recalculation.controller.ts`) | `MARKS_ADJUST` or `RESULTS_PUBLISH` (decide with A) |

Also from the plan:
- **Question ownership:** `questions.owner_id` and `topics.owner_id`, so bank lists are filtered by owner. The topic summary should count only the owner's questions.
- **Who adjusted:** the adjustment endpoint stores `adjustedBy` (`users.id`), so the UI can show an instructor's or TA's name without other changes.
- **Student analysis (#10, C):** should show `adjustReason` next to an adjusted question.

## 6. Behaviour changes others should know

- **Coding drafts** carry a language header (§3). Empty code still saves as `''`, so "answered" checks on `textResponse` are unchanged.
- **Manual adjustment (#13).** On the question-wise attempt view ("Adjust" per question):
  - Set a new mark, or add/take away marks, with a required reason (modelled on Moodle's "Make comment or override mark").
  - Only finished attempts can be adjusted, and only graded questions (not while code is pending).
  - The attempt's total is recomputed at once, and the audit log gets `SCORE_ADJUSTED` with the old and new values.
  - It survives re-grading and recalculation.
  - Results that are already published change too: the student sees the new score.
- **Recalculation** (`ResultTotalsService.recompute`, B) now adds manual adjustments on top of the recalculated scores. It used to replace any manual change.
- **API start-up:** the API refuses to start if `RUNNER_SECCOMP_PROFILE` (default `../../infra/runner/seccomp.json`, relative to `apps/api`) is missing. A Docker image or deployment that runs the API must ship `infra/runner/seccomp.json` or set the variable.
- **Runner images.** C, C++ and Java need `npm run runner:images --workspace=apps/api` on the machine whose Docker runs the sandboxes. In production they also need gVisor (`RUNNER_DOCKER_RUNTIME=runsc`) unless `RUNNER_REQUIRE_GVISOR_FOR_COMPILED=false`.
- **Reaper.** A job removes Docker containers labelled `secure-exam-runner=1` that are past their deadline, every minute. It never touches other containers.
- **Question bank UI.**
  - It opens on topic cards. Opening a topic shows question-type cards and the list.
  - Filters live in the URL (`?topicId=…&type=…`; `topicId=all` means "All questions", `none` means Uncategorised).
  - A new question must have a topic or "Uncategorised"; the API still accepts no topic, for CSV import.
- **Seed:** the sample exam's two coding questions accept Python, C, C++ and Java. Two global topics, "Operating systems & networks" and "Python basics", are assigned to the sample questions.

## 7. Where conflicts are likely, and how to resolve them

| File | Likely conflict | Resolution |
|---|---|---|
| `apps/api/src/database/seed.ts` | A/C add their own seed steps | Keep all steps. B's are `seedCodingQuestion`, `seedCodingLanguages` and `seedTopics`; order doesn't matter, and each is idempotent. |
| `apps/api/src/common/config/env.validation.ts`, `.env.example` | Everyone adds variables | Keep all lines; B's are in the `RUNNER_*` block. |
| `packages/types/src/index.ts`, `audit.types.ts` | New exports and new enum members | Keep every line. |
| `question-score.entity.ts`, `score-recorder.service.ts` (A) | A edits results for #1/#11 | Keep B's marked block and the two lines (§2). |
| `localRunner.ts`, `channels.ts`, kiosk scripts (C) | C changed the runner or the setup in parallel | Take B's runner (it is a superset) and re-apply C's other edits; then `npm run desktop:test`. |
| `answer.schema.ts` (C) | C edits the DTO | Keep `MaxLength(CODE_DRAFT_MAX_LENGTH)` on `textResponse`. |
| Controllers' `@Roles(Role.ADMIN)` | A's #1 replaces guards | Use the table in §5. |
| `CLAUDE.md` | Not tracked in git | No conflict. |

After merging, run:

```bash
npm install && npm run typecheck
npm run api:test && npm run content-ui:test && npm run web:test && npm run desktop:test
npm run runner:images --workspace=apps/api && npm run test:runner --workspace=apps/api   # needs Docker
npm run migration:run    # on a database that has only migrations applied
```

## 8. Open items

- **Negative marks.** A's MCQ grading gives `-negativeMarks` for a wrong answer. B's question-wise matrix and `ResultTotalsService` (used by recalculation and adjustments) give 0. This predates Phase 5.
  - **Effect:** after a recalculation, or for the "automatic score" shown when adjusting, a wrong MCQ answer counts 0 instead of its negative mark.
  - **Fix (A + B):** add `negativeMarks` to `MatrixQuestion` and apply it in `buildCell`. Decide whether `applyAdjustment` may then go below 0.
- **Total override vs per-question adjustment:** retire it or keep it as bonus marks (§2).
- **To verify on Ubuntu** (the user will, after merging):
  - the lab-PC sandbox self-test;
  - the checklist in `docs/local-code-runner.md`, including C, C++ and Java;
  - gVisor on the runner host (`RUNNER_GVISOR_TESTS=1`) and its start-up cost.
- **Pre-existing type error** in `packages/exam-content-ui/src/__tests__/CodingQuestionView.test.tsx`: `DesktopBridge` gained a required `isDesktop` (C's type), and a test's fake bridge lacks it. Tests still pass; fix when merging with C.

## 9. B-only changes (for reference)

- **#8:**
  - Compile check before tests.
  - Error kinds and lines (`error-classifier.ts`).
  - The amber error box with a hint in `RunResults`.
- **#14:**
  - `GET /question-bank/topics/summary`.
  - `topicId=none`.
  - Global topics are listed in every course.
  - Card UI (`BankCards.tsx`) and URL filters (`bankQuery.ts`).
- **#19:**
  - `infra/runner/seccomp.json` (built by `build-seccomp.mjs`).
  - gVisor switch and per-language sandbox overrides.
  - Hardened images (`infra/runner-images`).
  - `RunMonitorService`, `SandboxReaperService`.
  - 15 new real-Docker abuse tests.
- **#16:**
  - Registry entries and images for C/C++/Java.
  - Language picker and per-language code in the exam view.
  - Authoring: allowed languages, starter-code tabs, reference language.
  - Grading in the student's language.
  - 27 new real-Docker tests.
- **#13:**
  - `ScoreAdjustmentService`.
  - Matrix `applyAdjustment`.
  - The "Adjust" form in `AttemptDrilldownDialog`.
  - "±" marker on adjusted cells in the matrix.

Details: `docs/execution-security.md`, `docs/local-code-runner.md`, `phase5_feature_plan.md`.
