# Phase 5 — Person C implementation and handoff

## Team note: what Person C adds and what to preserve when merging

This note compares Person C's work with the starting checkout at `a8e1218`
(`Pahse 5 plan updated`). It also records issues found and corrected during
Phase 5 testing. It is not an audit of newer commits on GitHub's `main` branch:
if `main` has advanced, check whether the corresponding fix is already present.

The starting project already had Electron guards, security-event reporting,
offline answer saving, a coding runner and server-controlled timing. These were
extended and corrected here; they were not all missing implementations.

| Area | Starting limitation or issue found during testing | Person C's delivered behavior |
| --- | --- | --- |
| Coding submission and grading | Saved drafts and explicit submissions were not clearly distinguished throughout the exam workflow. | New exams require explicit Submit by default, with an instructor-controlled draft-grading option. Palette state distinguishes drafts, submitted code and later edits; the finish dialog explains unsubmitted work. |
| Leaving a coding question | Clicking a question in the palette could bypass the unsubmitted-code warning. | Palette, Previous, Save & Next and review navigation share the warning. The cross stays on the question; Continue and Submit now are the two actions. |
| Run/test panel sizing | Running code could enlarge the panel and leave inconsistent spacing after switching questions. | The coding workspace has bounded sizing and scrollable output so Run results do not keep stretching the layout. |
| Student review and results | Review feedback was duplicated below the question; wrong selected options could appear green, and awarded marks were separated from the question header. | Inline correct/incorrect colours, marks beside the question number, and removal of duplicate option feedback. Published, owner-only review includes hidden-test details for learning; active-exam responses still redact them. |
| Additional time | Whole-exam time granted before a student started did not reliably reach that student's allowance; the added-time notice persisted and Instructions showed only the base duration. | Pre-start and running extensions apply, the notice clears after 30 seconds, and Instructions refreshes and shows base minutes plus extra minutes. |
| Desktop window and shortcut security | Reporting focus loss alone did not stop desktop shortcuts from leaving the exam. Window sizing/fullscreen regressions were also found during Phase 5 testing. | Maximised startup, confirmed fullscreen before entry, Linux fullscreen recovery, and temporary Ubuntu/GNOME shortcut suppression with restoration. Ordinary escape attempts keep the exam open and use warnings/admin logging. Key labels use Win/Ctrl and readable names. |
| Ctrl+Alt+Delete and re-entry | A dedicated interruption/re-entry workflow was needed. | On Linux, this shortcut closes the app without submitting. Reopening an active attempt requires approval through Monitoring's Allow device change action. Server-saved answers remain and the timer continues. |
| Launch and session isolation | Exam launch replaced the browser refresh session, and active-attempt re-entry needed explicit approval/session binding. | Separate exam refresh sessions, invigilator-approved launch sessions, rejection of displaced sessions, and separate offline stores for new sessions. Browser launch also uses a server-validated, single-use captcha. |
| Answer continuity and deployment | Review marks/last position and college intranet setup needed additional support. | Persisted review marks and last question, improved save/sync feedback, two additive migrations, and an intranet deployment/backup recipe with configurable API URLs and optional LAN restrictions. |

The shortcut-setup timeout was introduced during this Phase 5 work and fixed by
batching GNOME settings writes; it should not be described as an original
`main` defect. The fullscreen ordering and dialog-overflow fixes likewise include
follow-up corrections made during integration.

The user reported the final Ubuntu workflow working as required on 5 November
2026. This does not establish equivalent OS-level protection on every Linux
desktop, Windows or macOS. Preserve the existing managed kiosk-session support
and the platform requirements documented below. Offline data that has not reached
the server is not guaranteed to survive an app-close storage wipe.

For A and B: merge the API, shared contracts, active web app, Electron worker and
its resource-copy script together. Apply both C migrations and retain the
publication/ownership checks, explicit-submit policy, navigation guard and
desktop restoration logic. The next sections identify the permission and coding
integration points that must be reconciled with your own Phase 5 changes.

## Scope and decisions

Implements the code portions of #3, #6, #7, #9, #10, #12, #15, #17 and #18
in the active `apps/web`, API and Electron client. New exams require explicit
coding **Submit** by default. `gradeUnsubmittedCode` enables draft fallback
per exam. Existing exams retain their previous draft-grading policy through
the migration. Device changes require invigilator approval; time keeps running.

- Code palette state is derived from the latest confirmed submission and current
  draft. Draft-only/changed code stays amber; matching submitted code is green;
  review marks remain independent. Run and Save & Next do not submit code.
- Save & Next, Previous, review-and-next and question-palette navigation warn about unsubmitted code. Closing the warning stays on the current question. Finish shows separate objective and
  coding counts, links to unsubmitted coding questions, and the exam's grading
  policy. It still permits finishing without code submissions.
- Students can review their own finalized attempt from the dashboard before
  publication. Publication unlocks keys, explanations, scores, sample test
  details for both sample and hidden tests, including input, expected output,
  stdout and stderr (user-requested policy update, 2026-11-04). These details
  remain private before publication and during attempts. Draft code is labelled separately.
- Browser launch requires a server-generated, hashed, single-use captcha with a
  two-minute TTL. A wrong/expired answer consumes it and returns a replacement.
- Registrations offers per-student extensions for scheduled/active exams.
  Both whole-exam grants and personal accommodations apply before start. Whole-exam
  grants increase the allowed duration as well as the closing time; personal time
  applies after the closing-time cap. Heartbeats update running timers. The added-time
  notice disappears after 30 seconds and reappears when the total changes.
- Answers persist review marks; heartbeat persists the last open question.
  A second launch waits in the app while Monitoring offers “Allow device change”.
  Approval binds the new device session and records `DEVICE_CHANGED`.
  Displaced requests return `409 SESSION_MOVED`; the old screen locks and stops
  syncing. New sessions use a separate offline database to avoid replaying an
  old device's cached edits. Unsynced data on a dead machine cannot be recovered.
- Exam refresh sessions are separate from the browser refresh token, so a device
  launch does not sign the browser out. Exam-session logout leaves the browser
  session intact.
- Exam dialogs use focus-managed controls; palette states have labels; theme
  tokens, mobile layout, loading/error/empty states and save indicators improved.

## Database and local startup

Stop the development API before running migrations: dev TypeORM synchronize must
not add the new columns before the migration does. Back up an existing database.

```bash
npm install
python3 scripts/check-low-memory.py npm run typecheck
npm run migration:run
```

C owns migrations `1794200000000-C-Phase5ExamContinuity` and
`1794200001000-C-LaunchSecurity`. They add the code policy, review/session fields,
captcha table and exam refresh sessions; both provide down migrations. They are
additive to A's `17940000…` and B's `17941000…` range. No existing user database
was migrated as part of this work.

If a previous dev boot already synchronized these columns, restore a pre-change
DB backup or reconcile its schema/migration history deliberately. Do not mark a
migration applied without checking all of its changes and the legacy policy
backfill.

## Contracts for Person A

A's Phase 5 `Permission`, `AccessService`, course ownership and role replacement
are **not in this checkout**. This branch uses the current ADMIN/STUDENT access
model; it does not invent a competing permissions model. When merging A:

| Integration point | Required merge behavior |
| --- | --- |
| `POST /attempts/:id/device-change/approve` | `@RequirePermission(Permission.MONITOR)` and `AccessService.assertAttempt(user, id, Permission.MONITOR)` before approval; wrong course returns 404. Pass the full user through to the service. |
| Monitoring / Registrations extension actions | Use A's course-scoped MONITOR / EXTEND_TIME UI permissions; retain A's service-side scope checks. |
| `GET /me/exams/:examId/submission` | Remains STUDENT-only and scoped by JWT user ID plus finalized attempt. No staff bypass. |
| Exam launch / session refresh | Retain examSessionId + examId JWT claims and the separate refresh table. Preserve A's instructor/TA desktop rejection and renamed staff override. |
| Dashboard/form and result publication | Retain A's scheduling, course scope and publication checks; add `gradeUnsubmittedCode` and `extendedMinutes`. Review respects optional `passMarkEnabled === false`. |

After merging, add/run A's cross-course 404 tests for the approval endpoint and
verify a TA without MONITOR cannot approve. Those cases cannot be honestly
verified against the current global-admin model.

## Contracts for Person B

- `LatestCodeSubmission` (shared types): questionId, submissionId, code, language,
  savedAt, status. `GET /attempts/:attemptId/code/submissions` returns the latest
  explicit PENDING/GRADED submission per question, never test details.
- `CodingQuestionView` adds optional `onCodeChange(code)`,
  `onSubmitted(code, result, language)` and `latestSubmission`. Keep the success
  callback tied to the exact submitted code/language when adding the language
  selector. Emit it only after a successful server save. The current runner
  remains Python; C does not enable B's unfinished compiled-language sandboxes.
- When merging #16, carry the selected draft language through the exam store,
  saved draft payload and Save & Next's “Submit now” action. Today that action
  selects the question's existing supported language. Compare both code and
  language for palette dirtiness once multiple languages are supported.
- `AttemptAccessAdapter.getDraftCode` applies `gradeUnsubmittedCode` before
  returning a fallback draft. Explicit submissions always take precedence. Keep
  this rule in B's grader/recalculation changes.
- Code saves take the attempt row lock and recheck status/session/expiry just
  before insertion; preserve this alongside B's grading and sandbox work.
- Review accepts B's optional `autoScore`, `manualAdjustment`, `adjustReason`
  and test `errorKind`, and A's optional `passMarkEnabled`. These fields are read
  only when available; C adds no duplicate score/pass-mark columns or enum.
- Hidden-test details remain redacted in active-attempt/Run/Submit responses.
  The user explicitly requested all test details in the owner-only published review.
  Preserve that publication gate when merging #8; map response fields explicitly.
- C's intranet deployment recipe supports a separate rootless runner. B owns
  gVisor/seccomp, compiled images and local-runner cgroups. Keep the current
  Python-only deployment until B's #19/#16 are verified.

## Verification on a small laptop

Use `python3 scripts/check-low-memory.py <command>` for one command at a time.
It limits Node heap to 768 MiB, uses one CPU core at low priority, limits helper
thread pools, and stops its process group if available RAM falls below 1.5 GiB
or group RSS exceeds 1.2 GiB. It cannot guarantee protection against unrelated
processes consuming memory. API tests default to in-band, web tests to one
worker, and desktop tests to concurrency one. Do not run development servers,
builds and test suites together on an 8 GB laptop.

```bash
python3 scripts/check-low-memory.py npm run api:test -- --silent
python3 scripts/check-low-memory.py npm run web:test
python3 scripts/check-low-memory.py npm run desktop:test
python3 scripts/check-low-memory.py npm run api:build
python3 scripts/check-low-memory.py npm run web:build
```

Docker image builds, real sandbox abuse tests, capacity tests and lab rehearsal
belong on the prepared lab/server environment, not this laptop.

## Manual acceptance

1. Create a new exam; confirm draft grading is off. In a separate exam enable it.
   Type/run/save code without Submit: amber and warning. Submit: green. Edit:
   amber. Reload and resume: same status. Finish accepts either state and grading
   follows the configured policy; a prior explicit Submit still wins over edits.
2. Finish a mixed exam. Open “Review submitted answers”. Before publication no
   keys/marks/explanations appear. Publish results: see analysis and sample
   details, including hidden inputs/expected output/student output/errors. Try another student's credentials.
3. Start without a captcha answer, then use a wrong/expired/replayed challenge.
   Confirm replacement and throttling. Refresh and solve a new challenge.
4. Give everyone +10 then +5 minutes before any attempt starts; a later starter must receive +15 in both their dashboard and actual expiry. Also give a registered student +15 personal minutes before start. Check dashboard and actual
   expiry. Add +5 during the attempt; check the next heartbeat and timer label.
5. On device one save an objective answer, a code draft, a Submit, a review mark
   and position; wait for “All changes saved”. Launch on device two. It must wait
   for approval. Approve in Monitoring, retry on device two, and verify the same
   timer/answers/position and submitted state. Also test a Submit followed by a
   device loss before autosave: the submitted source must be restored. Device one must lock on its next
   request and must not submit or overwrite answers. Time continues throughout.
6. Repeat with offline pending edits on device one. Confirm they are not claimed
   to be saved and do not overwrite restored server answers on the new session.
7. Check 1366×768 and narrow browser layouts, keyboard navigation, visible focus,
   modal focus/escape behavior and light/dark contrast. The remaining polish pass
   follows actual student/invigilator pilot feedback.
8. Follow `infra/intranet/README.md` for deployment, TLS, offline rehearsal,
   backup/restore and capacity acceptance. These need college IT and real hosts.

## Checks performed in this checkout

- Shared types/validation/API-client builds, API build and unified web production
  build passed. Web build still reports large Monaco chunks and the existing
  shared-barrel dynamic-import limitation; it completes successfully.
- Web: 19 test files, 105 tests passed. Shared content UI: 8 files, 52 tests passed.
  The final submit-after-navigation regression was then added and its focused
  coding UI suite passed all 18 tests. Shared content UI typecheck also passed.
  Two additional restoration regressions cover Submit arriving before autosave
  and preserving newer/unsynced drafts; the focused hook/store suite passed all
  10 tests, followed by a successful final production web build.
- API lint passed with warnings (no errors); `git diff --check` passed.
- Desktop compilation and 16 in-process Node tests passed (including install-time
  API configuration). Electron GUI/packaging was not launched.
- Backend full unit run completed. The changed desktop-guard mock was corrected;
  the affected/new suites subsequently passed (9 suites, 63 tests). Two Python
  seed suites encountered sandbox subprocess restrictions and passed outside
  that sandbox (9 tests), still under the memory guard. The optional real Docker
  runner suite was skipped; no containers/load generators were started.
- These are mocked/unit and build checks, not a substitute for database migration,
  real browser/Electron, invigilator device-switch, or college LAN acceptance.

## Manual-test fixes (2026-11-04)

- Published review displays awarded marks beside each question number. Correct
  options are green, selected incorrect options red, and unpublished selections
  neutral. No separate repeated option list. Coding statements render Markdown;
  repeated title headings and Monaco sticky-scroll duplicate context are removed.
- Coding workspace height is bounded on desktop; Run output scrolls inside its
  panel instead of stretching the page. The user's explicit divider sizing remains
  available. Verify short/long output, switching questions, and 1366×768 layouts.
- Launch window uses display work-area bounds and maximises after showing. During
  an attempt controls for resizing/moving/minimising are disabled where supported,
  minimise/hide/fullscreen exits recover the window, external-link IPC is denied,
  and DevTools are closed. Escape shortcuts are registered only during the exam
  and released on submission/exit. Failed OS registrations are logged honestly.
- Electron in a normal GNOME/Windows desktop cannot guarantee suppression of
  OS-reserved shortcuts. Windows Ctrl+Alt+Delete needs OS kiosk policies; Linux
  requires the dedicated Cage/Openbox session (and lab console policies for
  console escape sequences). No system-wide hardening was applied to the laptop.
  See [Electron window APIs](https://www.electronjs.org/docs/latest/api/browser-window)
  [Cage options](https://github.com/cage-kiosk/cage/blob/master/cage.1.scd),
  and [Windows Keyboard Filter](https://learn.microsoft.com/en-us/windows/configuration/keyboard-filter/).
- Recompile the desktop client (`npm run desktop:compile`) and restart it to test
  native window changes. Restart the API. Existing in-progress attempts retain
  their persisted expiry; grant any previously missed minutes explicitly. Test
  the corrected pre-start extension behavior with a fresh attempt.

Verification for these manual-test fixes: 54 targeted API tests, 11 web review/
navigation/notice tests, 23 coding UI/panel tests, and 20 desktop tests passed.
API and web production builds, desktop compilation, final web typecheck and
`git diff --check` passed. Checks ran sequentially under the memory guard.
Native GUI/window-manager behavior and the panel layout still require manual
retesting; no Electron window, Docker workload or system kiosk installer was run.

## Linux fullscreen and shortcut follow-up

Cross-checked against Person C's Electron and OS security responsibilities in
sections 7–8 of `phase4_improvements_electron_kiosk_codeeditor_plan.md`. That
historical plan left Linux as a platform stub; this follow-up implements the
GNOME integration while retaining the existing managed Linux kiosk sessions.

The Linux window must remain resizable while the window manager negotiates
fullscreen; the lock now requests fullscreen before kiosk, matching the older
working order. Startup maximisation cannot override an active exam. Login waits
for native shortcut protection and confirmed fullscreen before redeeming the
launch token or starting/resuming an attempt; failure blocks entry with a reason.

On Ubuntu/GNOME (including Wayland), a separate Python/Gio worker temporarily
suppresses desktop escape bindings: switching windows/workspaces, showing the
desktop, minimising, the Super overview, application launchers, GNOME logout/lock,
screenshots, custom launcher bindings and supported Wayland VT shortcuts. Input
language switching and normal editor shortcuts are retained. No root access,
package removal, systemd masking or global OS installation is used.

The worker saves exact user overrides before changing anything, resets keys that
originally inherited defaults, and restores on submission, invigilator exit,
parent-process EOF or termination. A durable user-data journal is recovered at
the next app launch after a power loss or killed worker. Independent changes made
to a key during the exam are preserved. Protection loss shows the existing
warning banner and is logged without replacing the question screen.
Already-configured dedicated kiosk sessions use
`EXAM_KIOSK_SESSION=1`; do not set this on an ordinary desktop to bypass protection.
Other Linux desktops need that configured session; they are not silently treated
as protected. This is keyboard/window protection, not a claim to prevent hardware
power-off or every compositor gesture. macOS/Windows retain their separate
Electron controls; the GNOME worker is Linux-only.

Requirements: `/usr/bin/python3`, PyGObject/Gio (`python3-gi` on Ubuntu), GNOME
settings schemas and the logged-in user's session bus. The worker is copied by
`npm run desktop:compile` and unpacked outside ASAR in packaged builds. Launch a
new app process after compiling; an already-running Electron instance keeps its
old main process and preload. Recovery journal: `gnome-shortcuts.json` inside
Electron's user-data directory. The worker's `--recover` mode restores only a
saved journal and does not acquire a new shortcut lease.

The unsubmitted-code warning keeps the cross as its single stay/cancel action;
two action buttons wrap inside the responsive dialog. Instructions display base
minutes plus the student's added minutes and refresh every 15 seconds even when
the exam is already live.

Focused verification: 18 web tests, 23 desktop tests and 8 Python restoration
tests passed. The Python tests use a fake settings backend, including watchdog
EOF/termination checks; they never modify the tester's actual desktop settings.
Desktop compilation, the web production build (including TypeScript), shell
syntax and whitespace checks passed. The web build retains bundle-size and
mixed static/dynamic import warnings.

Manual acceptance after closing every old exam-app process and reopening from
the dashboard: confirm maximised login followed by fullscreen exam; try Alt+Tab,
Super, Super+D/M and Ctrl+Alt+Delete; verify the original bindings return after
submission or invigilator exit. Check the warning at narrow width (cross stays on
the current question), and grant an extension before starting to see base plus
extra minutes on Instructions within 15 seconds. Native shortcut suppression and
fullscreen still require this real-desktop check; no kiosk session or GUI was
launched during automated verification.

References: [GNOME window bindings](https://github.com/GNOME/gsettings-desktop-schemas/blob/master/schemas/org.gnome.desktop.wm.keybindings.gschema.xml.in),
[Wayland bindings](https://github.com/GNOME/mutter/blob/main/data/org.gnome.mutter.wayland.gschema.xml.in),
[restoring user overrides](https://gnome.pages.gitlab.gnome.org/gtk/gio/method.Settings.get_user_value.html).

### 5 November: launch timeout and interruption correction

The per-key `Gio.Settings.sync()` calls caused setup to exceed the 15-second
deadline on this laptop. Reproduced with real Gio/dconf on a private D-Bus bus
and temporary config/cache/runtime directories: acquisition took 20.34 seconds.
Settings now use delayed transactions, apply once per schema and sync once per
batch. The same isolated test acquired in 1.23 seconds and restored in 0.14
seconds. No real user desktop preferences were changed by these checks.

Normal escape shortcuts remain blocked and feed the warning banner/admin event
queue without closing the window or replacing the exam. Per the requested
exception, Ctrl+Alt+Delete interrupts the app without submitting the attempt.
The renderer allows its debounced draft to save, flushes the audit queue, then
closes; the native process has an eight-second fallback if the renderer stalls.
Online events are sent before closing; offline/unacknowledged data is not
guaranteed to survive the existing app-close storage wipe.

To resume, the student opens the exam again from the browser and signs in. This
creates a pending request in the existing Monitoring approval flow. The admin
selects **Allow device change**, then the student retries Login in the same app.
This applies even on the same computer: every new launch session for an active
attempt requires approval. The attempt retains server-saved answers and its
original running timer; an invigilator can grant additional time if needed.
The native Ctrl+Alt+Delete interception is implemented for Linux; Windows secure
attention sequences remain OS-managed.

Verification for this correction: 25 desktop tests, 9 Python recovery/batching
tests, 19 web launch/event tests and 9 API launch/approval tests passed. Desktop
compilation, web TypeScript checking and `git diff --check` passed. Checks ran
under the low-memory guard. The real private-bus dconf timing test passed; actual
GNOME keyboard/fullscreen behaviour still needs a manual exam on the desktop.
