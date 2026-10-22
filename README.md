# Secure Exam Platform: local setup guide (macOS and Ubuntu)

This guide assumes a fresh computer and no knowledge of the project. It has a complete,
separate walkthrough for **macOS** (Part A) and **Ubuntu** (Part B), then shared reference
material (Part C). Follow only your own part, top to bottom.

- [How it works](#how-it-works)
- [Part A: macOS](#part-a-macos)
- [Part B: Ubuntu](#part-b-ubuntu)
- [Part C: reference (both systems)](#part-c-reference-both-systems)
  - [C1. Accounts and ports](#c1-accounts-and-ports)
  - [C2. Environment variables](#c2-environment-variables)
  - [C3. Tests, lint, builds](#c3-tests-lint-builds)
  - [C4. Stop, reset, start over](#c4-stop-reset-start-over)
  - [C5. Troubleshooting](#c5-troubleshooting)
  - [C6. Windows](#c6-windows)
  - [C7. Project layout and further reading](#c7-project-layout-and-further-reading)

---

## How it works

Day to day you run **two things** (the API and the website), and the exam app opens by itself:

```
terminal 1:  npm run api:start      the backend            http://localhost:3000
terminal 2:  npm run web:dev        the website            http://localhost:3003
                                    (or both in one terminal: npm run dev)
```

1. A student opens http://localhost:3003 in a normal browser and signs in.
2. They open their exam and press **Start exam in exam app**.
3. The browser opens the exam app **automatically**. The server first gives the browser a
   one-time launch token (valid 120 seconds, single use), and the browser opens
   `secure-exam://launch/<token>`. The operating system hands that link to the exam app.
   (The student's password never reaches the app.)
4. The exam app opens on a launch screen showing the student's email and a masked password.
   The student presses **Login**, and the exam starts in a locked-down full-screen window.
5. After **Submit**, only an "Exam submitted" screen with a **Close** button remains
   (it closes itself after 30 seconds).

Nobody pastes a token anywhere. The one thing that needs a one-time setup on a development
machine is telling the operating system *which program opens `secure-exam://` links*. A normal
installed app does this itself; when you run from source, the command **`npm run exam:register`**
does it (Part A step 8, Part B step 8). Do it once per computer.

Admins use the website in a normal browser. Admins are refused inside the exam app, by design.

The API refuses to start, serve, save or submit an exam unless the request comes from the exam
app, so an exam can only be taken in it.

---

# Part A: macOS

Tested on macOS (Apple Silicon). Steps 1 to 8 are one-time setup; step 9 is what you do every day.

## A1. Install the tools

Open **Terminal** (Cmd+Space, type "Terminal").

```bash
# Homebrew (skip if `brew --version` already works): https://brew.sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Git, Node.js 22, Python 3
brew install git node@22 python@3.12
brew link --overwrite --force node@22

# Check. node must be v22.12.0 or higher (v24 also works)
node -v
npm -v
git --version
python3 --version
```

Why Node 22.12+: Vite 8 needs `^20.19 || >=22.12` and the `electron` package needs `>=22.12`.
Node 18 or 20 will break the install or the build.

**Docker Desktop:** download from https://www.docker.com/products/docker-desktop/, install it and
**open it**. Wait until the whale icon in the menu bar says it is running. Then:

```bash
docker version
docker compose version
```

(Docker runs the database, and runs student code on the server for coding questions.)

macOS has no `bubblewrap`, so student code that is run *inside the exam app* ("Run" in the code
editor) runs **without a sandbox** on macOS. That is acceptable for development only. The launcher
installed in step 8 sets this up for you.

## A2. Get the code

```bash
cd ~/Developer          # or any folder you like (create it with mkdir -p ~/Developer)
git clone git@github.com:arnavmishra2005/secure-exam-platform.git
# no SSH key set up? use HTTPS:
#   git clone https://github.com/arnavmishra2005/secure-exam-platform.git
cd secure-exam-platform
git checkout integrate/final
```

Everything below is run **from this folder (the repo root)**.

## A3. Install dependencies

```bash
npm install
```

This installs every package of every workspace into one root `node_modules`. As part of it, the
`electron` package **downloads the Electron binary** (about 100 MB from GitHub). Check it worked:

```bash
npx electron --version      # must print v44.9.3
```

Type the `--version` part. Plain `npx electron` (without it) opens Electron's own welcome window
("To run a local app, execute the following on the command line"). That is not an error and not
this project; close it.

If it printed an error ("Electron failed to install correctly"), fetch the binary and check again:

```bash
node node_modules/electron/install.js
npx electron --version
```

## A4. Build the shared packages

```bash
npm run typecheck
```

Despite the name, this **builds** `packages/types`, `packages/validation` and `packages/api-client`
into `dist/` folders (they are git-ignored, so a fresh clone has none). The API and the migrations
cannot run without them. It is the same as these three commands, in this order:

```bash
npm run build --workspace=packages/types
npm run build --workspace=packages/validation
npm run build --workspace=packages/api-client
```

Run `npm run typecheck` again whenever you change anything under `packages/types`,
`packages/validation` or `packages/api-client`, or pull changes that touch them.

## A5. Create the `.env` files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

The defaults work as they are. Check that the API file allows the exam app's origin:

```bash
grep CORS_ORIGIN apps/api/.env
# must include app://exam, e.g.
# CORS_ORIGIN=http://localhost:3001,http://localhost:3002,http://localhost:3003,app://exam
```

And that both lock switches are `true` (they are in the example files):

```bash
grep REQUIRE_DESKTOP apps/api/.env apps/web/.env
# apps/api/.env:REQUIRE_DESKTOP_CLIENT=true
# apps/web/.env:VITE_REQUIRE_DESKTOP_EXAM=true
```

What every variable means: [C2](#c2-environment-variables). The website reads its `.env` only when it
starts, so restart `npm run web:dev` after editing `apps/web/.env`.

## A6. Start the database

Docker Desktop must be running.

```bash
docker compose up -d postgres
docker compose ps
```

`postgres` must show `running (healthy)`. If it says `starting`, wait ten seconds and repeat.
(A warning that the `version` attribute is obsolete is harmless.)

## A7. Create the tables, add sample data, pull the Python image

```bash
npm run migration:run       # must be done BEFORE the API has ever started
npm run db:seed             # sample accounts, a course and a sample exam
docker pull python:3.12-slim
```

- **Migrations before the API:** in development the API creates tables itself. If it starts on an
  empty database first, the migrations then fail with `relation "..." already exists`. If that
  happens, reset ([C4](#c4-stop-reset-start-over)).
- The seed is safe to repeat. It creates the accounts in [C1](#c1-accounts-and-ports) and an
  **active** sample exam (`11111111-1111-4111-8111-111111111111`) with five multiple-choice
  questions and one coding question ("Merge Intervals"). Never run it against shared data.
- `python:3.12-slim` is used by the **server** to run and grade coding questions. Without it,
  everything else works but coding questions cannot be graded.

## A8. Register the exam app as the opener of `secure-exam://` links (one time)

```bash
npm run exam:register
```

This compiles the Electron app and installs a tiny launcher, `~/Applications/SecureExamDev.app`,
which macOS then uses for every `secure-exam://` link. The launcher starts **this checkout's**
exam app with the link. It has no Dock icon and nothing to open by hand.

Test it (this needs the API running, so do it after step 9, or skip):

```bash
open "secure-exam://launch/test"
```

The exam app should open (it will report that the launch link is not valid; that is expected for a
fake token). Close it with Cmd+Q.

Notes:
- Run `npm run exam:register` again if you **move or rename the repo folder** (the launcher stores
  the absolute path), or after reinstalling `node_modules`.
- To undo it: `npm run exam:register -- --remove`.
- The first time a browser opens the link it asks "Open SecureExamDev?" (Safari: "Allow this page
  to open SecureExamDev?"). Allow it, and tick "Always allow" if offered.

## A9. Run it (every day)

Open two terminals at the repo root.

```bash
# Terminal 1
npm run api:start          # wait for: Nest application successfully started
```
```bash
# Terminal 2
npm run web:dev            # wait for: Local: http://localhost:3003/
```

(Or, in a single terminal: `npm run dev`. It compiles the exam app, then starts both.)

Now take an exam:

1. Open http://localhost:3003 in Safari or Chrome.
2. Sign in as `alice@secure-exam.dev` / `Student@1234`.
3. Open the exam, tick the confirmation, and press **Start exam in exam app**.
4. Allow the browser's "Open SecureExamDev?" prompt (first time only).
5. The exam app opens. Press **Login**. The exam starts in the locked window.

Inside the app in development, the invigilator PIN to leave an exam early is `1234`.

Admin: http://localhost:3003 in the browser, `admin@secure-exam.dev` / `Admin@1234`.

If the exam app does not open when you press the button, see
[C5 "The exam app does not open"](#the-exam-app-does-not-open-when-i-press-start-exam-in-exam-app).

If you change anything in `apps/exam-client/src` (the Electron code), run `npm run desktop:compile`
(or `npm run exam:register` again). `npm run dev` does this automatically.

---

# Part B: Ubuntu

Written for Ubuntu 22.04 and 24.04 on a normal desktop session (GNOME). **This path has not been
run on a Linux machine by the authors**; the commands follow the code and standard Ubuntu
practice. If a step fails, see [C5](#c5-troubleshooting) and report it. Steps 1 to 8 are one-time
setup; step 9 is what you do every day.

## B1. Install the tools

Open a terminal (Ctrl+Alt+T).

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 bubblewrap xdg-utils

# Node.js 22 (NodeSource). Do NOT use plain `apt install nodejs`: that version is too old.
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v      # must be v22.12.0 or higher
npm -v       # 10 or higher
```

Why Node 22.12+: Vite 8 needs `^20.19 || >=22.12` and the `electron` package needs `>=22.12`.

**Docker Engine and Compose:**

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

**Log out and log back in** (or reboot) so the `docker` group applies. Then:

```bash
docker version
docker compose version        # "docker compose" with a space (Compose v2)
```

**Libraries Electron needs.** A normal Ubuntu desktop has most of them already; install them to be sure.

Ubuntu 22.04:
```bash
sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgtk-3-0 libgbm1 \
  libasound2 libxss1 libxtst6 libx11-xcb1 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2
```
Ubuntu 24.04 (four packages were renamed with a `t64` suffix):
```bash
sudo apt install -y libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libgtk-3-0t64 libgbm1 \
  libasound2t64 libxss1 libxtst6 libx11-xcb1 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2
```
If a later run says `error while loading shared libraries: libXXX.so`, install the package that
provides that file.

`bubblewrap` (installed above) is the sandbox in which student code runs inside the exam app.
`python3` runs it. `xdg-utils` provides `xdg-mime`, used in step 8.

Check:
```bash
bwrap --version && python3 --version && xdg-mime --version
```

You need a normal **graphical** session. Over plain SSH or on a server install there is no window
to show.

## B2. Get the code

```bash
cd ~
mkdir -p Developer && cd Developer
git clone git@github.com:arnavmishra2005/secure-exam-platform.git
# no SSH key set up? use HTTPS:
#   git clone https://github.com/arnavmishra2005/secure-exam-platform.git
cd secure-exam-platform
git checkout integrate/final
```

Everything below is run **from this folder (the repo root)**.

## B3. Install dependencies

```bash
npm install
```

Never use `sudo npm install`. As part of the install the `electron` package **downloads the Electron
binary** (about 100 MB from GitHub). Check it worked:

```bash
npx electron --version      # must print v44.9.3
```

Type the `--version` part. Plain `npx electron` opens Electron's own welcome window; that is not an
error, close it.

If it printed an error ("Electron failed to install correctly"):

```bash
node node_modules/electron/install.js
npx electron --version
```

## B4. Allow Electron's sandbox (Ubuntu 24.04 only; skip on 22.04)

Ubuntu 24.04 restricts the kind of sandbox Electron uses, and Electron then refuses to start with
`The SUID sandbox helper binary was found, but is not configured correctly` or `No usable sandbox!`.
Fix it once (**repeat it whenever you reinstall `node_modules/electron`**):

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

(Alternative that lasts until reboot: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.)
Do not use `--no-sandbox`.

## B5. Build the shared packages

```bash
npm run typecheck
```

Despite the name, this **builds** `packages/types`, `packages/validation` and `packages/api-client`
into `dist/` folders (they are git-ignored, so a fresh clone has none). The API and the migrations
cannot run without them. It is the same as these three commands, in this order:

```bash
npm run build --workspace=packages/types
npm run build --workspace=packages/validation
npm run build --workspace=packages/api-client
```

Run `npm run typecheck` again whenever you change anything under those three packages or pull
changes that touch them.

## B6. Create the `.env` files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

The defaults work as they are. Check:

```bash
grep CORS_ORIGIN apps/api/.env          # must include app://exam
grep REQUIRE_DESKTOP apps/api/.env apps/web/.env
# apps/api/.env:REQUIRE_DESKTOP_CLIENT=true
# apps/web/.env:VITE_REQUIRE_DESKTOP_EXAM=true
```

What every variable means: [C2](#c2-environment-variables). The website reads its `.env` only when it
starts, so restart `npm run web:dev` after editing `apps/web/.env`.

## B7. Start the database, create the tables, add sample data

```bash
docker compose up -d postgres
docker compose ps                  # postgres must show running (healthy); wait and repeat if "starting"

npm run migration:run              # must be done BEFORE the API has ever started
npm run db:seed                    # sample accounts, a course and a sample exam
docker pull python:3.12-slim       # the server runs and grades coding questions in this image
```

- **Migrations before the API:** in development the API creates tables itself. If it starts on an
  empty database first, the migrations fail with `relation "..." already exists`. If that happens,
  reset ([C4](#c4-stop-reset-start-over)).
- If port 5432 is taken by a local PostgreSQL: `sudo systemctl stop postgresql`.
- The seed is safe to repeat and creates the accounts in [C1](#c1-accounts-and-ports) and an
  **active** sample exam (`11111111-1111-4111-8111-111111111111`) with five multiple-choice questions
  and one coding question ("Merge Intervals"). Never run it against shared data.

## B8. Register the exam app as the opener of `secure-exam://` links (one time)

```bash
npm run exam:register
```

This compiles the Electron app, writes `~/.local/share/applications/secure-exam-dev.desktop`, and
makes it the default handler of `secure-exam://` links (`xdg-mime`). The last line it prints should
say the default handler is `secure-exam-dev.desktop`. Check it yourself:

```bash
xdg-mime query default x-scheme-handler/secure-exam      # secure-exam-dev.desktop
```

Test it (needs the API and website running, so do it after step 9, or skip):

```bash
xdg-open "secure-exam://launch/test"
```

The exam app should open (it reports that the launch link is not valid; that is expected for a fake
token). Close it with `pkill -f exam-client`.

Notes:
- Run `npm run exam:register` again if you **move or rename the repo folder** (the file stores the
  absolute path), or after reinstalling `node_modules`.
- To undo it: `npm run exam:register -- --remove`.
- The first time a browser opens the link it asks whether to open "Secure Exam (development)". Allow
  it. Firefox and Chrome both ask; tick "Always allow" if offered.
- Browsers installed as **snaps** (the default Firefox on Ubuntu, and Chromium) run in a confined
  sandbox and may not be able to hand links to apps outside it. If the button does nothing, use a
  `.deb` Chrome/Firefox, or the fallback in [C5](#the-exam-app-does-not-open-when-i-press-start-exam-in-exam-app).

## B9. Run it (every day)

Open two terminals at the repo root.

```bash
# Terminal 1
npm run api:start          # wait for: Nest application successfully started
```
```bash
# Terminal 2
npm run web:dev            # wait for: Local: http://localhost:3003/
```

(Or, in a single terminal: `npm run dev`. It compiles the exam app, then starts both.)

Now take an exam:

1. Open http://localhost:3003 in your browser.
2. Sign in as `alice@secure-exam.dev` / `Student@1234`.
3. Open the exam, tick the confirmation, and press **Start exam in exam app**.
4. Allow the browser's "open Secure Exam (development)" prompt (first time only).
5. The exam app opens. Press **Login**. The exam starts in the locked window.

Inside the app in development, the invigilator PIN to leave an exam early is `1234`.

Admin: http://localhost:3003 in the browser, `admin@secure-exam.dev` / `Admin@1234`.

If the exam app does not open when you press the button, see
[C5 "The exam app does not open"](#the-exam-app-does-not-open-when-i-press-start-exam-in-exam-app).

If you change anything in `apps/exam-client/src` (the Electron code), run `npm run desktop:compile`
(or `npm run exam:register` again). `npm run dev` does this automatically.

**Kiosk session (optional, separate):** the full-screen "Secure Exam Kiosk" login session, firewall
and USB blocking for lab machines are described in [infra/linux-kiosk/README.md](infra/linux-kiosk/README.md).
You do not need them for development.

---

# Part C: reference (both systems)

## C1. Accounts and ports

| Account | Email | Password |
|---|---|---|
| Admin (browser only) | `admin@secure-exam.dev` | `Admin@1234` |
| Student | `alice@secure-exam.dev` | `Student@1234` |
| Student | `bob@secure-exam.dev` | `Student@1234` |
| Student | `carol@secure-exam.dev` | `Student@1234` |

Login is limited to 5 attempts per minute per IP. If you see "Too many requests", wait a minute.

| What | Where | Port |
|---|---|---|
| PostgreSQL 16 (Docker) | `docker-compose.yml` | 5432 |
| API (NestJS) | `apps/api`; Swagger UI at http://localhost:3000/api/docs | 3000 |
| Website for admins and students (Vite) | `apps/web` | 3003 |
| Exam app (Electron) | `apps/exam-client/src` | none |
| Legacy admin portal / legacy student UI | `apps/admin-web` / `apps/exam-client/renderer` | 3001 / 3002 (not needed) |

## C2. Environment variables

### `apps/api/.env`

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgres://exam_user:exam_pass@localhost:5432/secure_exam` | Must match `docker-compose.yml`. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | `change-me-...` | At least 16 characters each, or the API refuses to start. Change them for anything but local use. |
| `CORS_ORIGIN` | `http://localhost:3001,http://localhost:3002,http://localhost:3003,app://exam` | Origins allowed to call the API. Required. Must include `app://exam` for the exam app. |
| `REQUIRE_DESKTOP_CLIENT` | `true` | Exams only work from the exam app. `false` lets a browser sit exams (quick development without the kiosk; also set the website switch to `false`). |
| `EXAM_LAUNCH_TTL_SECONDS` | `120` | How long a launch token lives. |
| `VIOLATION_FLAG_THRESHOLD` | `5` | Violations before an attempt is flagged for the invigilator. |
| `CODING_GRADING_MODE` | `DEFERRED` | `DEFERRED` grades code after the attempt ends; `LIVE` grades on submit. |
| `RUNNER_DOCKER_BIN`, `RUNNER_PYTHON_IMAGE` | `docker`, `python:3.12-slim` | The server runs student code in this Docker image. |
| `THROTTLE_LIMIT` | `1000` | Global rate limit (login has its own 5 per minute). |
| `ALLOW_ADMIN_ON_DESKTOP` | unset | `true` lets an administrator sign in inside the exam app (testing only). |

If a value is invalid the API stops at start-up and names it (`Config validation error: ...`).
Restart the API after editing.

### `apps/web/.env`

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_HEARTBEAT_INTERVAL_MS=15000
VITE_REQUIRE_DESKTOP_EXAM=true
```

Keep `VITE_REQUIRE_DESKTOP_EXAM` equal to the API's `REQUIRE_DESKTOP_CLIENT`. Restart `npm run web:dev`
after editing (Vite reads this file only at start-up).

### Environment of the exam app (set in the shell that starts it, not in a `.env` file)

| Variable | Default | Meaning |
|---|---|---|
| `EXAM_API_URL` | `http://localhost:3000` | Where the API is. |
| `EXAM_WEB_URL` | `http://localhost:3003` | Where the website's dev server is. |
| `EXAM_LAUNCH_LINK` | none | A `secure-exam://launch/<token>` link to start with (fallback, see C5). |
| `INVIGILATOR_PIN` | `1234` in development | PIN needed to leave an exam in progress. |
| `EXAM_UNSANDBOXED_RUNNER` | unset | `1` runs student code without bubblewrap. Development only. The macOS launcher sets it; on Ubuntu install `bubblewrap` instead. |

## C3. Tests, lint, builds

All from the repo root, none needs the database. Build the shared packages first
(`npm run typecheck`) or the API tests fail with `Cannot find module '@secure-exam/...'`.

| What | Command |
|---|---|
| API unit tests | `npm run api:test` |
| One API test file | `npm test --workspace=apps/api -- timer.service` |
| Website tests | `npm run web:test` |
| Exam content UI tests | `npm run content-ui:test` |
| Electron tests | `npm run desktop:test` |
| Legacy exam client tests | `npm run client:test` |
| API lint | `npm run api:lint` |
| Type-check website / content UI | `npm run web:typecheck`, `npm run content-ui:typecheck` |
| Build API / website | `npm run api:build`, `npm run web:build` |
| Apply / undo a migration | `npm run migration:run` / `npm run migration:revert` |

## C4. Stop, reset, start over

**Stop:** press Ctrl+C in each terminal. If something is stuck:

```bash
pkill -f "nest start"; pkill -f "node dist/main"; pkill -f vite; pkill -f exam-client
lsof -i :3000 -i :3003 -i :5432        # who is holding the ports
```
(`nest start` leaves a child `node dist/main`, so kill both.)

**Stop the database, keep the data:** `docker compose stop postgres`

**Wipe the database** (deletes all local data):

```bash
docker compose down -v
docker compose up -d postgres
npm run migration:run
npm run db:seed
```

**Reinstall everything:**

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/exam-client/renderer/node_modules
npm install
node node_modules/electron/install.js
npm run typecheck
npm run exam:register          # the launcher stores absolute paths
```
(On Ubuntu 24.04 repeat step B4 afterwards.)

## C5. Troubleshooting

### The exam app does not open when I press "Start exam in exam app"

1. Did you run `npm run exam:register` on this computer, and from this folder? (A8 / B8.) Run it again.
2. Did the browser ask "Open SecureExamDev?" (macOS) or "open Secure Exam (development)" (Ubuntu)?
   Allow it. If you clicked "Cancel" with "always" ticked, reset the browser's protocol-handler
   permission for http://localhost:3003.
3. Test the operating system without a browser:
   - macOS: `open "secure-exam://launch/test"`
   - Ubuntu: `xdg-open "secure-exam://launch/test"`
   The app should open. If not: macOS `ls ~/Applications/SecureExamDev.app`; Ubuntu
   `xdg-mime query default x-scheme-handler/secure-exam` (must print `secure-exam-dev.desktop`).
4. Ubuntu: run the exact command the launcher runs, in a terminal, to see its error message.
   It is the `Exec=` line of `~/.local/share/applications/secure-exam-dev.desktop`. Typical causes:
   missing libraries or the 24.04 sandbox fix (B4).
5. Ubuntu with a snap browser: see the note in B8. Try a `.deb` browser.
6. **Fallback that always works** (also useful for debugging): `npm run exam:app` signs in as alice,
   fetches a token and starts the app directly. Options: `npm run exam:app -- bob@secure-exam.dev Student@1234 <examId>`.
   By hand: copy the `secure-exam://launch/...` link the website prints in development under the
   button and run `EXAM_LAUNCH_LINK="<link>" npm run desktop:start --workspace=@secure-exam/exam-client-desktop`.

### The exam app opens Electron's welcome page ("To run a local app, execute the following on the command line")

Electron was started with no app. Close it. Causes: plain `npx electron`, running the `Electron`
binary directly, or (macOS) an old registration pointing at the bare binary. Run
`npm run exam:register` again, which makes the launcher the handler. If the exam app itself shows it,
`apps/exam-client/dist/main/main.js` is missing: `npm run desktop:compile`.

### The launch screen says the link is invalid, expired or already used

Tokens last 120 seconds and work once. Press **Start exam in exam app** again.

### Node, npm, install

| Symptom | Fix |
|---|---|
| `EBADENGINE` warnings or syntax errors while building | Node too old. Install Node 22.12+ (A1 / B1), delete `node_modules`, `npm install`. |
| `command not found: node` | Reopen the terminal. macOS: `brew link --overwrite --force node@22`. |
| `EACCES` during `npm install` (Ubuntu) | Never `sudo npm install`. `sudo chown -R "$USER" ~/.npm .` then retry. |
| `ECONNRESET` / timeouts | Network or proxy. Retry; behind a proxy `npm config set proxy` / `https-proxy`. |
| `gyp ERR!` | Build tools missing. Ubuntu: `sudo apt install build-essential python3`. macOS: `xcode-select --install`. |

### "Cannot find module '@secure-exam/...'"

The shared packages are not built: `npm run typecheck` (or the three `npm run build --workspace=packages/...`
commands from A4 / B5, in that order). If a build itself says it cannot find `@secure-exam/types`, build
`types` first. If it still fails, run `npm install` again.

### Electron

| Symptom | Fix |
|---|---|
| `Electron failed to install correctly` / `node_modules/electron/dist` missing | `node node_modules/electron/install.js`. If github.com is blocked, set `ELECTRON_MIRROR` to a reachable mirror, delete `node_modules/electron`, `npm install`. Never install with `--ignore-scripts` or set `ELECTRON_SKIP_BINARY_DOWNLOAD`. |
| Electron behaves like plain Node | `ELECTRON_RUN_AS_NODE` is set in your shell: `unset ELECTRON_RUN_AS_NODE`. The project's scripts and the launchers already clear it. |
| Cannot find `dist/main/main.js` | `npm run desktop:compile`. |
| Ubuntu: `SUID sandbox helper binary ... not configured correctly` / `No usable sandbox` | Step B4. |
| Ubuntu: `error while loading shared libraries: libXXX.so` | Install the library (B1; `t64` names on 24.04). |
| Ubuntu: `Missing X server or $DISPLAY` | There is no graphical session (SSH or server install). Run it on the desktop. |
| "Cannot run code on this computer: the sandbox (bubblewrap) is not installed." | Ubuntu: `sudo apt install bubblewrap`. macOS: the launcher sets `EXAM_UNSANDBOXED_RUNNER=1`; if you start the app by hand add it yourself. |
| Readiness check fails about the API | The API is not running at `EXAM_API_URL`, or `CORS_ORIGIN` lacks `app://exam`. |
| Admin login fails inside the exam app | By design. `ALLOW_ADMIN_ON_DESKTOP=true` in `apps/api/.env` for testing. |
| macOS says the app is unverified | Electron 44.9.3 is unsigned by design; expected in development. |

### Database and API

| Symptom | Fix |
|---|---|
| `Cannot connect to the Docker daemon` | Start Docker Desktop (macOS) / `sudo systemctl start docker` (Ubuntu). |
| `permission denied ... docker.sock` (Ubuntu) | `sudo usermod -aG docker "$USER"`, then log out and in. |
| `docker: 'compose' is not a docker command` | `sudo apt install docker-compose-plugin`, or use `docker-compose`. |
| `port is already allocated` on 5432 | A local PostgreSQL holds it. Stop it, or change the mapping in `docker-compose.yml` and `DATABASE_URL`. |
| `ECONNREFUSED 127.0.0.1:5432` | The database is not up: `docker compose ps`, wait for `healthy`. |
| `Config validation error: "JWT_ACCESS_SECRET" length must be at least 16` | Recopy `apps/api/.env.example`. |
| `relation "..." already exists` during `migration:run` | The API ran before the migrations. Reset (C4). |
| `relation "..." does not exist` when the API starts | You have not run `npm run migration:run`. |
| `password authentication failed for user "exam_user"` | The Postgres volume has other credentials: `docker compose down -v` (deletes local data). |
| `EADDRINUSE :::3000` | Another API is running. Kill it (C4). |
| HTTP 429 on login | 5 per minute per IP. Wait a minute. |
| CORS error in the browser console | Add the origin (no trailing slash) to `CORS_ORIGIN` and restart the API. |
| "This exam must be taken in the exam app" | Intended. Press **Start exam in exam app**. To sit one in a browser anyway: `REQUIRE_DESKTOP_CLIENT=false` in `apps/api/.env` **and** `VITE_REQUIRE_DESKTOP_EXAM=false` in `apps/web/.env`, restart both. |
| Coding question cannot be run/graded on the server | Docker not running, or `docker pull python:3.12-slim` not done. |

### Website

| Symptom | Fix |
|---|---|
| Blank page / "Network Error" | API not running, or wrong `VITE_API_BASE_URL`. Restart `npm run web:dev` after editing `.env`. |
| Vite says `Port 3003 is in use` and picks another | An old Vite is running; stop it. The exam app expects 3003. |

## C6. Windows

Use **WSL2 with Ubuntu** and follow Part B inside the Ubuntu terminal: `wsl --install -d Ubuntu`, install Docker
Desktop with WSL integration enabled, and clone the repo inside the Linux filesystem (`~`, not `/mnt/c`).
Windows 11 shows the Electron window through WSLg, but `secure-exam://` links clicked in a *Windows* browser
are not handed to a WSL app. For native Windows development, run `npm run exam:register` once, then use
`npm run client:desktop:windows`; `npm run exam:app` is also available as a manual launch helper. A packaged
Windows installer can be built with `npm run desktop:build:windows` and registers the protocol when installed.
These Windows paths cover app startup and deep links only; Windows OS-level kiosk lockdown and the sandboxed
local code runner are not implemented.

## C7. Project layout and further reading

```
apps/api                    NestJS API
apps/web                    website for admins and students (Vite, port 3003)
apps/exam-client/src        Electron main + preload code (the exam app)
apps/exam-client/renderer   legacy student UI (port 3002)
apps/admin-web              legacy Next.js admin portal (port 3001)
packages/types              shared types          (needs build: npm run typecheck)
packages/validation         shared DTOs           (needs build)
packages/api-client         axios API wrappers    (needs build)
packages/exam-content-ui    shared exam UI + code editor (used from source)
scripts/                    exam:register and exam:app helpers
docs/                       design notes and contracts
infra/linux-kiosk           Linux kiosk session, firewall and USB-block scripts
```

- [CLAUDE.md](CLAUDE.md): architecture, invariants and gotchas.
- [docs/kiosk-integration.md](docs/kiosk-integration.md): the exam app design, what has been verified and what has not.
- [docs/local-code-runner.md](docs/local-code-runner.md): the student-code sandbox contract.
- [docs/phase4-contracts.md](docs/phase4-contracts.md): shared API contracts.
- [infra/linux-kiosk/README.md](infra/linux-kiosk/README.md): the Linux kiosk session.
