# Kiosk integration: decisions, fixes and follow-ups

Written for Person A, B and C. It records how Person C's `kiosk-work` branch was merged into the
A+B integration (`integrate/a-b`), why, and what is still open. Branch: `integrate/final`.

**Rule used for the merge:** `integrate/a-b` is the reference. C worked against the older legacy
apps, so C's code was adapted to the unified `apps/web`, never the other way round.

## 1. Architecture after the merge

```
Student PC                                        Server
┌───────────────────────────────────────┐        ┌──────────────┐
│ Electron (apps/exam-client/src)       │        │ apps/api     │
│  main: window, guards, IPC, runner    │  HTTP  │  /auth       │
│  preload: window.desktop              │◄──────►│  /health     │
│  ┌─────────────────────────────────┐  │        │  /attempts   │
│  │ apps/web (the only student UI)  │  │        │  ...         │
│  │ dev:  http://localhost:3003     │  │        └──────────────┘
│  │ prod: app://exam  (built dist)  │  │   X-Client-Type: DESKTOP is added by
│  └─────────────────────────────────┘  │   Electron on every API request
└───────────────────────────────────────┘
```

**What runs where.** The admin portal and the student dashboard, results and notifications all work in a normal
browser (`apps/web`). The exam app is a single-purpose exam launcher, like Safe Exam Browser:

```
browser                          exam app (Electron)                          after the exam
───────                          ───────────────────                          ──────────────
student signs in
opens the exam, ticks the
instructions, "Start exam in
exam app"
   │ POST /auth/exam-launch  → one-time token (hashed in the DB, ~2 min, single use)
   └─ secure-exam://launch/<token> ─►  opens on /launch:
                                       email (read-only) + password (dots, read-only)
                                       readiness checks, "Login"
                                          │ POST /auth/exam-launch/redeem → normal session
                                          ▼
                                       starts / resumes the attempt, locks the window → exam
                                          │ submit
                                          ▼
                                       "Exam submitted" + Close app + 30 s auto-close ─► app wipes its data and quits
```

The password never leaves the browser: the app only ever sees the one-time token. The app can show exactly three
screens (`/launch`, `/student/exam`, `/student/exam/submitted`); everything else is blocked in the web app
(`DesktopLockRoot`) and in the main process (`allowedPaths.ts`, `navigationGuard.ts`).

- `apps/exam-client/src` is C's Electron shell. It loads `apps/web`.
- `apps/exam-client/renderer` and `apps/admin-web` are legacy and untouched by the kiosk work.
- The Electron shell is a thin wrapper. All exam UI stays in `apps/web`, so there is one UI to maintain.
- `window.desktop` is the only bridge between the web app and the shell. Its type is `DesktopBridge`
  in `packages/types/src/client-security.types.ts`. In a plain browser it does not exist, and every
  helper in `apps/web/src/features/exam-taking/desktop/desktop.ts` is a no-op.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Electron loads `apps/web`, not the legacy renderer | `apps/web` has the dashboard, exam taking, monitoring and B's coding view. The legacy renderer lacks them. The 9-day plan says the same. |
| 2 | Kiosk UI ported into `apps/web/src/features/exam-taking/desktop/`, restyled with the UI kit | One UI. `ReadinessGate` is on the instructions page, `ViolationBanner` is in `ExamLayout` only, so it never shows on admin or dashboard pages. |
| 3 | The window starts as a normal window. Lockdown starts only when an exam is in progress | The old code locked the whole app at launch, so even admins and the login screen were in kiosk mode. Lockdown is `SET_SECURITY_MODE(true)`, sent by `ExamPage` when an attempt is `IN_PROGRESS`. |
| 4 | Every guard keys off `isSecurityActive()` alone (input, focus, display, context menu, close) | The old `NODE_ENV === 'production' \|\| isSecurityActive()` made the guards always on in production. |
| 5 | Dev mode is `!app.isPackaged` (`main/config.ts`) | A packaged Electron app does not set `NODE_ENV`, so it was treated as dev (DevTools on, loads `localhost`). |
| 6 | Production serves the built `apps/web` from a custom `app://exam` scheme | `apps/web` uses a browser router, which breaks from `file://`. A real origin also keeps IndexedDB and Monaco's workers working. The handler serves only files inside the build directory and falls back to `index.html`. |
| 7 | Administrators are refused in the exam app, on the server | `POST /auth/login` and `/auth/refresh` return 403 for `role=admin` with `X-Client-Type: DESKTOP`, checked before any token is issued, and audit-logged as `LOGIN_FAILED` (`admin_on_desktop`). `ALLOW_ADMIN_ON_DESKTOP=true` lifts it for development. Enforcing it on the server means a client bug cannot let an admin into the kiosk. |
| 8 | Electron adds `X-Client-Type: DESKTOP` itself (`session.webRequest`) | Web code cannot forget it. The header is advisory: someone in a browser can send it, but that only restricts themselves. |
| 9 | C's role-selection login, admin redirect page and SSO token-in-URL handoff were dropped | `apps/web` already has one login that routes by role. Passing a refresh token in a URL leaks it to history and logs. |
| 10 | Local code runner: `window.desktop.runCode`, bubblewrap on Linux | Contract in `docs/local-code-runner.md`. The student's code is untrusted, so: no network, read-only system, private `/tmp`, scrubbed environment, memory cap, process group killed at the deadline. |
| 11 | `prlimit --nproc` is not used | `RLIMIT_NPROC` counts every thread the user owns. Electron has hundreds, so the sandbox would not start. `bwrap --unshare-all` and killing the group cover fork bombs. |
| 12 | Runner without bubblewrap rejects, unless `EXAM_UNSANDBOXED_RUNNER=1` in dev | Fail closed. Never run student code unsandboxed in production. The view falls back to the server or tells the student to call the invigilator. |
| 13 | Blocked paste becomes the violation `CLIPBOARD_BLOCKED` | It goes through the same path as C's other violations, so it reaches the audit log once the events endpoint exists. |
| 14 | `window.desktop` typed once, in `packages/types` | Two `declare global` blocks with different types for `Window.desktop` do not compile. `exam-content-ui` now uses the shared `DesktopBridge`. |
| 15 | Invigilator exit PIN has no default outside dev | The old default `1234` shipped in production. Without `INVIGILATOR_PIN`, nobody can exit mid-exam except by submitting. |
| 16 | Added a public, unthrottled `GET /health` | C's readiness check pings it. It always reported "server unreachable" before. |
| 17 | Electron pinned to exactly `44.9.3` (was `^31`) | Apple revoked the notarization of Electron 31.7.7 on macOS, so macOS reported `Electron.app` as malware and removed it. 44.9.3 is the last release of the previous major line (45.0.0 was brand new). It is pinned exactly so every lab image and dev machine gets the same binary. Linux is unaffected by Apple's revocation. |
| 18 | Dev/start scripts clear `ELECTRON_RUN_AS_NODE` (`env -u`) | Some terminals (the VS Code integrated terminal, for one) export it. With it set, `electron .` runs as plain Node, `require('electron')` is a string, and the app cannot start. |
| 19 | Merge via a new branch `integrate/final`, not into `main` directly | `integrate/a-b` stays intact as the reference. |
| 20 | Exams are exam-app-only, enforced on the server (`DesktopClientGuard`, `REQUIRE_DESKTOP_CLIENT`, default on) | Applied to start attempt, fetch questions, save answer and submit. The browser keeps everything else. Without this, a student could sit the exam in a normal tab and skip the kiosk. The header is advisory against a determined cheater (anyone can send it); the OS kiosk session is the real barrier. |
| 21 | The browser opens the app through `secure-exam://launch/<token>`, a one-time launch token, never a password | The scheme is registered by the app (electron-builder `protocols` + `mimeTypes`; `setAsDefaultProtocolClient`). `deepLink.ts` accepts only a 43-character base64url token. The token is created by `POST /auth/exam-launch` (students only), stored as a SHA-256 hash, valid `EXAM_LAUNCH_TTL_SECONDS` (default 120), and used up by one atomic `UPDATE ... WHERE usedAt IS NULL AND expiresAt > now()`, so two simultaneous redeems cannot both win. A password or refresh token in a link would end up in browser history, OS handlers and logs. |
| 22 | Key blocking matches the physical key (`code`) and treats Ctrl and Cmd alike (`main/keyPolicy.ts`) | C's list only matched `Ctrl`, so Cmd+R reloaded on macOS. On macOS Option changes the produced character (Option+I types `ˆ`), so a rule on the character misses DevTools. Ctrl-or-Cmd on both systems is a safe superset. A pure function with tests for macOS and Linux. |
| 23 | AltGr is never blocked | Many layouts report AltGr as Ctrl+Alt; students need it for `[ ] { }` in Python. Only explicit Ctrl+Alt combinations (Ctrl+Alt+T, L, Del, F1-F7) are blocked. |
| 24 | Editing shortcuts are never blocked | Copy, paste, undo, select all, Cmd+Left/Right and word/line navigation stay. External paste into the editor is already refused by the editor itself. |
| 25 | The Super key is blocked on Linux only | On macOS Cmd is held for every shortcut (Cmd+C), so a bare Cmd press is not a violation. |
| 26 | No application menu except macOS's Edit menu | Electron's default menu carries Reload (Cmd+R), Quit and Close accelerators. Without a menu there is nothing to trigger them. macOS text fields need an Edit menu for Cmd+C/V/X/A/Z to work at all. |
| 27 | Quit is guarded in `before-quit` | The old handler marked the app as quitting first, which switched the lockdown off, so Cmd+Q went straight through. Now a quit during an exam is refused and logged; only the PIN-protected exit (which clears the exam state first) can quit. |
| 28 | Security events are buffered in the main process and drained by the page | If the page reloads or crashes, nothing is lost: the buffer lives in the main process. The page drains it every 3 s, saves unsent events in `localStorage`, and retries when offline. |
| 29 | Events are stored in `security_events` and also written to the audit log | The table gives the admin a per-attempt list; one `SECURITY_VIOLATION` audit line per batch (with `examId` and `attemptId`) lets the audit viewer filter on it. |
| 30 | Violation counts exclude informational events (`FOCUS_REGAINED`, `HEARTBEAT_LOST`) | Coming back to the window, or a flaky network, is not a violation. They are still stored and shown, marked `info`. |
| 31 | An attempt is flagged at `VIOLATION_FLAG_THRESHOLD` violations (default 5) | One global number for now. The contract has a per-exam policy; that is a follow-up. |
| 32 | A wrong exit PIN is logged as a violation | Trying to leave the exam is something the admin should see. |
| 33 | The API caps events at 50 per request and 2000 per attempt | A broken or hostile client cannot fill the table. |
| 34 | Another student's attempt answers 404, not 403, when reporting events | It does not reveal that the attempt exists. |
| 35 | `OPEN_EXTERNAL` only opens `http(s)` URLs | It used to hand any scheme to the operating system. |
| 36 | The sign-in screen shows the email and a masked password, both read-only, and a Login button | This is what the student sees, as asked, but it is a display: Login redeems the token. Nothing typed there can change who signs in. |
| 37 | The app opens on `/launch` and nothing else; no login, no dashboard | A student who opens the app directly gets "Open your exam from the browser" and a Close button. |
| 38 | Login goes straight into the exam (no instructions page in the app) | The student already read the rules and ticked the timer notice in the browser before the app opened. Readiness checks run on the sign-in screen and disable Login until they pass. |
| 39 | Preview and redeem are public but require `X-Client-Type: DESKTOP`, are throttled (10 per minute), and return **410 Gone** for a bad, used or expired token | 410 and not 401: the web client treats a 401 as "refresh the session and retry". Redeem also refuses admins and deactivated users. |
| 40 | The app's token is held in the main process and read over IPC (`getLaunchToken`), then forgotten (`clearLaunchToken`) | It never sits in a page URL or in the page's storage. |
| 41 | After submit the window **stays** locked on the "submitted" screen; it is not released | The student sees the message and can only close the app. Key blocking ends (nothing left to protect) and closing is allowed. |
| 42 | The submitted screen has one button, Close app, plus a 30-second auto-close; the main process quits the app 45 s after submit if the page cannot | No dashboard, no sign-out, no links. If the submission is still pending (offline) or not confirmed, nothing closes automatically and the student is told why. |
| 43 | The app wipes its own storage on every way out (`will-quit` -> `clearStorageData`) and when started without a link | No login or answers are left on the lab PC. The page does not clear them itself while the "submitted" screen is up: a request failing with 401 would send the app away from the message. |
| 44 | A stray route during an exam returns to the exam, not to the launch screen; the launch screen only clears the stored login when no exam is running | Otherwise any redirect to `/launch` mid-exam would sign the student out. Found while testing. |
| 45 | `ViolationBanner` and its exit button are hidden on the submitted screen | There is nothing to warn about, and the page has its own Close button. |
| 46 | Development registers its own `secure-exam://` handler: `npm run exam:register` | macOS only registers the scheme for a packaged app, and Electron's own dev registration points at the bare binary (welcome page), so `main.ts` registers only when packaged. The script installs a launcher (macOS applet / Linux `.desktop` + `xdg-mime`) that starts this checkout with the link. `EXAM_LAUNCH_LINK` and `npm run exam:app` are fallbacks. |

## 3. Bugs found and fixed during the merge

1. **Admin (and login screen) in kiosk mode:** see decisions 3, 4, 5.
2. **"Submitted" flag never reset.** After the first exam in an app session, `isExamSubmitted` stayed true, so a second exam started without lockdown. Now reset on `SET_SECURITY_MODE(true)`.
3. **Runner waited out the time limit** when a program left a background process holding the output pipes. It now finishes on process exit, waits briefly for buffered output, and kills the whole process group.
4. **Default exit PIN in production:** see decision 15.
5. **`/health` missing:** see decision 16.
6. **Doc recipe flaw:** `prlimit --nproc=64` in `docs/local-code-runner.md`: see decision 11.
7. **Noise events:** focus-lost, display-change and shortcut events were emitted on every screen, including the dashboard. They now fire only during an exam.
8. **Cmd+R, Cmd+W and others reloaded or closed the exam on macOS:** the key list only matched `Ctrl`, and the default Electron menu supplied Reload/Quit accelerators. See decisions 22 and 26.
9. **Cmd+Q quit the app mid-exam:** see decision 27.
10. **Cmd+Option+I (DevTools) would have slipped through on macOS** because Option changes the produced character. See decision 22.
11. **A bare Cmd press was a violation on macOS** in C's list (`meta` key rule), so every Cmd+C would have been logged.
12. **A stray route mid-exam signed the student out** (found by the end-to-end test of the launch flow): see decision 44.
13. **Nothing was reported to the server:** violations only lived in the banner and the console (`violationCount` was always null). See section 5.

## 4. Electron versions and macOS signing (what we learned)

- The official `electron-v44.9.3-darwin-arm64.zip` is **not** Developer-ID signed: the binary is only linker-signed ad hoc and has no `_CodeSignature` folder. So `codesign --verify --deep` and `spctl --assess` report "code has no resources but signature indicates they must be present". That is expected for this build and is **not** a sign of tampering or a bad download. Its SHA-256 matches the value published in Electron's `SHASUMS256.txt`.
- It runs fine because `npm install` downloads it without the macOS quarantine flag. Test with `Electron --version`, not with `spctl`.
- 31.7.7 was different: it carried a real signature, and `spctl` said "notarization indicates this code has been revoked". Do not use it.
- Packaged apps (`electron-builder`) must be signed by whoever distributes them; the Linux labs do not need this.
- If `node_modules/electron/dist/Electron.app` is missing after `npm install`, run `node node_modules/electron/install.js`.

## 5. Violation logging: how it works

```
key / focus / display / navigation / quit / paste
        │  (main process, only while an exam is running)
        ▼
emitSecurityEvent ──► banner in the page (student sees a warning)
        │
        └─► buffer in the main process ──► page drains every 3 s ──► POST /attempts/:id/events
                                              (kept in localStorage while offline)        │
                                                                                          ▼
                                       security_events table + one SECURITY_VIOLATION audit line
                                                                                          │
              monitoring screen & student-wise results: count (click for the list) ◄──────┘
```

- `POST /attempts/:attemptId/events` (student, own attempt, exam app) and `GET /attempts/:attemptId/events` (admin).
- Event types: `FOCUS_LOST`, `FOCUS_REGAINED`, `DISPLAY_CHANGED`, `BLOCKED_SHORTCUT` (detail = the keys, e.g. `Cmd+R`),
  `DEVTOOLS_ATTEMPT`, `NAV_BLOCKED`, `CLIPBOARD_BLOCKED`, `KIOSK_CHECK_FAILED`, `HEARTBEAT_LOST`.
- The admin opens **Monitoring** or **Results → Students** and clicks the violation count to see each event with its time.

### Electron-level protections while an exam is running

| Group | Combinations |
|---|---|
| Reload | Ctrl/Cmd+R, Ctrl/Cmd+Shift+R, F5, Ctrl/Cmd+F5 |
| Close / quit / new window | Ctrl/Cmd+W, Q, N, T, Shift+W/N/T/Q, Ctrl/Cmd+F4, Alt+F4 |
| Developer tools | F12, Ctrl/Cmd+Shift+I/J/C, Cmd+Option+I/J/C/U |
| Other browser shortcuts | Ctrl/Cmd+P, S, O, U, J, Ctrl/Cmd+Tab, PageUp/PageDown, zoom (+, -, 0) |
| Window switching | Alt+Tab, Alt+Esc, Alt+Space, Alt+F-keys, Alt+Left/Right/Home (Linux), Cmd+H, Cmd+M, Cmd+, Cmd+\` , Ctrl+Cmd+F |
| Screenshots | PrintScreen, Cmd+Shift+3/4/5/6 (only if the app sees them) |
| Ubuntu desktop | Super key (alone or combined), Ctrl+Alt+T, L, Delete, Backspace, F1-F7 |
| Windows keys (when delivered to Electron) | Win key alone or with any other key, Ctrl+Esc, Ctrl+Shift+Esc |
| Also | window close button, context menu, pinch/keyboard zoom, new windows and popups, leaving the app's own address |

Not blocked: Ctrl/Cmd+C, V, X, A, Z, Y, F, D, arrows, Backspace, normal typing, and AltGr.
Electron blocks a shortcut only if it receives the key event. Windows minimize events are detected and followed by
an attempt to restore kiosk/fullscreen state; fullscreen-exit events also trigger re-enforcement, and focus loss is
recorded with an attempt to restore the exam window. This is best-effort application behavior, not operating-system
lockdown: Windows may handle Win+D, Win+M, Win+Tab, taskbar shortcuts, Ctrl+Alt+Delete,
and other shell or secure-attention shortcuts before Electron can see them. The app deliberately does not attempt
to intercept Ctrl+Alt+Delete. Reliable prevention on managed exam devices requires Windows-level configuration,
configured and tested by the device administrator. The app does not enable or configure those controls. Ubuntu's `infra/linux-kiosk` removes
its system escape routes; macOS kiosk presentation options hide the Dock and menu bar, but neither is implied by the
Electron handlers alone.

### Windows dedicated-exam-device setup recommendation

For a dedicated Windows exam computer, provision a current supported Windows edition for a non-administrator
student account and keep a separate, protected administrator/invigilator account for maintenance. Apply and validate
Windows policy before the device is used for exams; the Electron app alone is not a secure Windows kiosk.

1. Prefer **Assigned Access restricted user experience** with a narrowly allowed application set and managed
   Start/taskbar experience. Restrict the student account to the exam client and only required system components,
   using the supported Assigned Access profile and AppLocker/policy controls for the target Windows release.
2. For specific key combinations, use **Keyboard Filter** on a supported edition (Enterprise, Education, or IoT
   Enterprise). Configure and test the desired combinations at the OS level, including Ctrl+Alt+Delete if the
   policy goal requires suppressing it. Microsoft documents that Keyboard Filter can suppress secure-attention
   combinations; this is a Windows feature and is not implemented by Electron. Check the supported edition and
   version, retain a controlled administrator breakout path, and validate physical and on-screen keyboards.
3. If the deployment needs the Electron desktop app to replace Explorer as the sign-in shell, consider **Shell
   Launcher** (Enterprise, Education, or IoT Enterprise) only with an additional application allowlist/policy.
   Shell Launcher selects and monitors the shell process; by itself it does not prevent users from accessing other
   applications or system components. Test Electron's child-process/restart behavior on the exact Windows image.
4. Use Group Policy or device management to limit sign-out, user switching, Settings, Task Manager, removable
   media, and application execution as required. Do not rely on hiding the taskbar alone. Keep Windows patched,
   disable ordinary student admin rights, protect firmware/boot settings, and control physical access.
5. Test the complete exit surface on the deployed image: Win keys and Task View, taskbar/notification area, Alt+Tab,
   Ctrl+Shift+Esc, Ctrl+Alt+Delete, lock/sign-out/user switching, app switching, Safe Mode/recovery, and every
   approved accessibility path. Confirm the administrator recovery procedure before enabling restrictions.

Assigned Access supports kiosk and restricted-user-experience scenarios on Pro, Enterprise, Education, and IoT
Enterprise editions, but **Keyboard Filter and Shell Launcher require Enterprise, Education, or IoT Enterprise**
editions. Keyboard Filter is disabled by default, requires a restart when enabled/disabled, and can be bypassed in
Safe Mode; its breakout-key and accessibility behavior must be included in the deployment threat model. Confirm
the current requirements and configuration schema against Microsoft's documentation for the exact Windows build:
[Assigned Access](https://learn.microsoft.com/windows/configuration/assigned-access/),
[Keyboard Filter](https://learn.microsoft.com/windows/configuration/keyboard-filter/), and
[Shell Launcher](https://learn.microsoft.com/windows/configuration/shell-launcher/).

## 6. What was verified, and what was not

**Verified automatically:** typecheck of every package and app; API 222 tests, web 72, content-ui 52, legacy client 46,
Electron 12 (key policy for macOS and Linux, deep-link parsing); API lint 0 errors; `web:build`; a fresh database built from
migrations only (no drift for the new table, revert and re-apply work).

**Verified by running it, launch flow (macOS, Electron 44.9.3, real window, isolated database/API/web, 2 full runs):**
- Browser side over HTTP: admins and anonymous callers cannot create a token; a token is stored hashed; the exam app can preview it; a browser cannot preview or redeem it; a made-up token gives 410; redeem works once, the second try gives 410; the new session works; the login is audited; 4 simultaneous redeems give exactly one success.
- The app opens on `/launch` with the email read-only, the password read-only and shown as dots, typing does nothing, and the token is not present in the page. Login goes straight to `/student/exam` (fullscreen, frameless). An attempt already running is resumed.
- `location.assign`, a router push to `/student/dashboard` and to `/admin/exams` all leave the student on the exam; each is recorded as a `NAV_BLOCKED` violation.
- Finish exam -> Confirm & Submit -> "Exam submitted ... instructor will publish the results ... check them in your browser ... close this app", one button (Close app), no links, cannot navigate away, countdown from 30, the app closed itself, and its log shows the stored login, cache and answers were cleared. The server shows the attempt `SUBMITTED`, one submission, the token used, the app login in the audit log.

**Verified by running it, earlier (macOS, Electron 44.9.3, real window):**
- The API refuses start / questions / save answer / submit from a browser (403) and accepts the exam app; admins cannot start an exam.
- Events are recorded, shown to the admin, counted on the monitoring and results screens, and written to the audit trail.
- Alice signs in inside Electron, resumes the exam, and the window goes frameless fullscreen with the Dock hidden.
- 15 blocked combinations (Cmd/Ctrl+R, Cmd+Shift+R, F5, Cmd+W/Q/N/T/P, Cmd+Option+I, F12, Ctrl+Shift+I, Cmd++, Ctrl+Tab, Option+F4) did **not** reload the page, and each one reached the server. Copy, paste, select all, undo, Cmd+Left and plain typing were not flagged.
- A wrong exit PIN is refused and logged; the right PIN closes the app.
- `runCode` runs Python through the real preload (unsandboxed dev mode); the readiness checks pass; the session is restored when the app is reopened.

**Not verified:**
- The keys were injected through Electron's debugging protocol, which goes through the same keyboard path (`before-input-event`) as a physical keyboard. A final check by hand on a real keyboard is still worth doing, especially on Ubuntu.
- Everything on Ubuntu: the key policy is unit-tested for Linux, but the lockdown, Super-key blocking, forced refocus, `setAlwaysOnTop('screen-saver')` behaviour under Wayland vs X11, the `infra/linux-kiosk` scripts, nftables, the bubblewrap command line, and Monaco inside Electron.
- `secure-exam://` links: parsing is tested and the app was started with a link through `EXAM_LAUNCH_LINK`, but the browser actually handing the link to the installed app is untested (macOS only registers the scheme for a packaged app; Linux needs the `.deb`/AppImage installed, which writes the `MimeType` entry).
- `npm run desktop:build` and the packaged `app://exam` path. Only the dev path (`localhost:3003`) has been run.
- Cmd+C/V in text fields via the macOS Edit menu (the injected keys cannot exercise menu roles).
- Quit guard: Cmd+Q is blocked at the key level and tested; the `before-quit` path itself (for example the Dock menu's Quit) was not triggered.
- A full browser click-through of the admin screens: the new violations dialog was type-checked and built, not clicked.

## 7. Follow-ups and improvements

### Needs the backend (A / C)
- **One event vocabulary.** The API stores C's `DesktopViolationType` (`NAV_BLOCKED`, `DEVTOOLS_ATTEMPT`, `CLIPBOARD_BLOCKED`, ...). The older contract enum `SecurityEventType` in `packages/types` (`BLOCKED_NAVIGATION`, `READINESS_FAILED`) is now unused. Delete it, or map it, so there is one list.
- **Per-exam policy:** replace the global `REQUIRE_DESKTOP_CLIENT` and `VIOLATION_FLAG_THRESHOLD` with `ExamSecurityPolicy` (require desktop, flag threshold, auto-submit threshold, `minClientVersion`) per exam, editable by the admin. Also send a client version header and refuse outdated apps.
- **Auto-submit or lock** an attempt at a violation threshold (P1 in the plan). Today it is only flagged.
- **Client type is advisory:** the header can be sent by anyone. For stronger proof, bind exam sessions to a device (`DeviceSession`) and issue a short-lived exam token only to the app after the readiness check.
- **Resuming from a browser:** reading the question list and saving answers are blocked from a browser, but the attempt's heartbeat and `GET /attempts/:id` are not. That reveals nothing sensitive; revisit if it matters.
- **Device sessions:** one active session per student (`DeviceSession` in the contract types).
- **Server-controlled exit PIN:** fetch it from an exam policy instead of an environment variable.

### Exam launch (A / C)
- **One refresh token per user.** `users.refreshTokenHash` holds a single hash, so signing in inside the exam app replaces the browser's refresh token. The browser session keeps working until its 15-minute access token expires, then the student has to sign in again in the browser (which is when they would look at results anyway). Fix: a table of refresh tokens per device/session instead of one hash. It touches Person A's auth module.
- Old rows in `exam_launch_tokens` are never deleted. Add a small cleanup (a cron or on `create`) for rows past `expiresAt + 1 day`.
- `POST /auth/exam-launch` does not check that the student is registered for the exam or that it is active; the attempt start does, and the app shows that message. Checking at creation would stop a pointless app launch.
- A student who closes the app early can start again from the browser only while the exam window and their own timer allow. A new launch token resumes the running attempt. Consider telling the admin when an app is closed mid-exam (a `HEARTBEAT_LOST` is the only signal today).
- Auto-close is 30 s (`AUTO_CLOSE_SECONDS`) and the main-process fallback 45 s; make them settings if the invigilators want something else.
- The sign-in screen's password field is a display; if you ever want a real second factor (an exam PIN typed at the lab), this is where it would go.

### Electron app (C)
- The old `exitPolicy.test.mjs` tested a copy of the logic, so it was removed. The exit rule (PIN needed during an exam, free after submit) now lives in `ipc/channels.ts` with no test: extract it into a pure function next to `keyPolicy.ts` and test it.
- Keep a hand-run test for the Ubuntu lab image: press every combination in section 5 on a real keyboard and check the admin sees it.
- The readiness check treats any HTTP response from `/health` (even 500) as reachable, and its 5-second timer is never cleared.
- `platform/` only has Linux (`linux.ts`). Add a Windows implementation if the labs run Windows (see `9_day_plan_windows_linux_kiosk.md`).
- The forbidden-process list is a fixed array. Make it configurable from policy.
- `HEARTBEAT_LOST` is an accepted violation type (not counted), but nothing raises it yet. Raise it from the web app's heartbeat failures (`useServerClock`) through `logViolation`.
- Decide what happens if the renderer crashes mid-exam (reload the page and resume the attempt, and log it). Not checked.
- Packaging: confirm `extraResources` copies `apps/web/dist` to `resources/web`, and test an installer on a clean lab image. Add code signing later.

### Runner (B / C)
- Add the acceptance checklist in `docs/local-code-runner.md` as an automated Linux CI test (fork bomb, memory bomb, network, filesystem, environment).
- The cap is address space (`prlimit --as`). Python can fail to start with very small budgets. A cgroup memory limit is stronger if the lab image allows it.
- Add a small unit test suite for `runner/localRunner.ts` (the manual test used the unsandboxed dev mode).
- Cap total CPU time per exam so repeated Run clicks cannot slow the PC.

### Web app (A / B)
- Tests for `ReadinessGate`, `ViolationBanner`, the violations dialog and `SubmittedPage`'s unlock behaviour with a fake `window.desktop`. (`flushSecurityQueue`, `OpenInExamApp` and `DesktopOnly` are covered.)
- The "Open in exam app" button only works once the app is installed. Detect a failed launch (the page stays visible and focused) and show "the app does not seem to be installed".
- The legacy `apps/exam-client/renderer` (port 3002) cannot start an exam any more while `REQUIRE_DESKTOP_CLIENT=true`; it is superseded, so this is deliberate.
- Per-question violation timeline in the Questions tab, and a CSV export of violations for the exam report.
- Show a clear message on the login page when the server refuses an admin in the exam app. It already shows the server message; consider a dedicated "Open the admin portal in a browser" screen.
- If the student reloads the page mid-exam, `ExamPage` re-locks once the attempt loads. Check there is no unlocked flash.

### Repo hygiene
- Delete the unused `ResultTableScoreSink` (`apps/api/src/modules/coding/score-sink/`).
- Delete the legacy `apps/exam-client/renderer` and `apps/admin-web` once everyone agrees `apps/web` is complete. The legacy `client:*` scripts and tests then go too.
- `docker compose up --build` still has the known problems listed in `CLAUDE.md` (API Dockerfile does not build `packages/*`).
- The `docker-compose.yml` change from C (a `DATABASE_URL` override for the API container) is harmless for the local Postgres-only workflow.
- C's `seed.ts` change resets seeded users' passwords on every seed run. Fine for dev; do not run the seed against shared data.

## 8. Running it

```bash
npm install && npm run typecheck
docker compose up -d postgres && npm run migration:run && npm run db:seed
npm run api:start                 # apps/api/.env: CORS_ORIGIN must include app://exam for packaged builds
npm run web:dev                   # browser: sign in, open the exam, press "Start exam in exam app"
                                  # the page shows the launch link (development only)
EXAM_LAUNCH_LINK="secure-exam://launch/<token>" npm run client:desktop   # opens the app on that exam
# no bubblewrap on your machine? for development only:
EXAM_UNSANDBOXED_RUNNER=1 npm run client:desktop
# test an admin in the exam app (dev only): ALLOW_ADMIN_ON_DESKTOP=true in apps/api/.env
# sit an exam in a normal browser (dev only): REQUIRE_DESKTOP_CLIENT=false in apps/api/.env
#                                             and VITE_REQUIRE_DESKTOP_EXAM=false in apps/web/.env
npm run desktop:test              # key policy (macOS + Linux) and deep-link tests
```

Environment variables added: `ALLOW_ADMIN_ON_DESKTOP` (default false), `REQUIRE_DESKTOP_CLIENT` (default **true**),
`VIOLATION_FLAG_THRESHOLD` (default 5), `EXAM_LAUNCH_TTL_SECONDS` (default 120) on the API; `VITE_REQUIRE_DESKTOP_EXAM` (default true) in `apps/web`;
`EXAM_API_URL`, `EXAM_WEB_URL`, `EXAM_LAUNCH_LINK` (development), `INVIGILATOR_PIN`, `EXAM_UNSANDBOXED_RUNNER` for Electron.

**Existing `.env` files:** `REQUIRE_DESKTOP_CLIENT` defaults to true, so after pulling this branch the browser can no longer
start an exam. To test in a browser, set both flags above to false.
