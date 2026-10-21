# Secure Exam Platform: complete local setup guide

This guide assumes you have a fresh computer and have never seen this project.
Follow it top to bottom. Every command is shown, with what it does and what you
should see. If something fails, go to [Troubleshooting](#14-troubleshooting).

## Quick start: two commands

After the one-time setup (sections 3 to 8 and 10.1), running the platform and sitting an exam
in the locked-down exam app takes two commands, in two terminals at the repo root:

```bash
npm run dev           # terminal 1: starts the API (:3000) and the web app (:3003) together
npm run exam:app      # terminal 2: opens the exam app on the sample exam, signed in as alice
```

`npm run exam:app` does what the browser's "Start exam in exam app" button does: it signs in
as `alice@secure-exam.dev`, asks the API for a one-time launch token and starts the Electron
app with it. **You do not copy or paste anything.** In the app press **Login**, and the exam
starts in the locked window. Wait for `npm run dev` to show the API and web app started
before running the second command.

Other students or exams: `npm run exam:app -- bob@secure-exam.dev Student@1234 <examId>`.
Admins use the web app in a normal browser: http://localhost:3003, `admin@secure-exam.dev` /
`Admin@1234` (admins are refused inside the exam app).

Why a launch token exists at all, and how a real student gets into the app, is explained in
[section 10](#10-run-the-electron-exam-app).

---

- [1. What you are setting up](#1-what-you-are-setting-up)
- [2. Which operating system?](#2-which-operating-system)
- [3. Install the prerequisites](#3-install-the-prerequisites)
- [4. Get the code and install packages](#4-get-the-code-and-install-packages)
- [5. Build the shared packages](#5-build-the-shared-packages)
- [6. Create the `.env` files](#6-create-the-env-files)
- [7. Start PostgreSQL](#7-start-postgresql)
- [8. Migrate and seed the database](#8-migrate-and-seed-the-database)
- [9. Start the API and the web app](#9-start-the-api-and-the-web-app)
- [10. Run the Electron exam app](#10-run-the-electron-exam-app)
- [11. Development shortcuts](#11-development-shortcuts)
- [12. Tests, lint and builds](#12-tests-lint-and-builds)
- [13. Reset everything / stop everything](#13-reset-everything--stop-everything)
- [14. Troubleshooting](#14-troubleshooting)
- [15. Docker Compose for the full stack](#15-docker-compose-for-the-full-stack-not-recommended-yet)
- [16. Project layout and further reading](#16-project-layout-and-further-reading)

---

## 1. What you are setting up

The repo is an **npm-workspaces monorepo** (one `package.json` at the root, many
packages inside). Everything is installed and run **from the repo root** unless a
step says otherwise.

| Piece | Folder | Port | What it is |
|---|---|---|---|
| PostgreSQL 16 | `docker-compose.yml` | 5432 | The database (runs in Docker). |
| API | `apps/api` | 3000 | NestJS backend. Swagger UI at http://localhost:3000/api/docs |
| Web app | `apps/web` | 3003 | The main UI for admins **and** students (Vite + React). |
| Exam app | `apps/exam-client` (`src/`) | none | Electron desktop app. Students must sit exams in it. It loads `apps/web`. |
| Shared packages | `packages/types`, `validation`, `api-client`, `exam-content-ui` | none | Code shared by the apps. Three of them must be **built** before anything else works (section 5). |
| Legacy admin portal | `apps/admin-web` | 3001 | Old Next.js admin UI. Optional, not needed. |
| Legacy student UI | `apps/exam-client/renderer` | 3002 | Old Vite student UI. Optional, cannot start exams any more. |

**How an exam is taken (so the steps below make sense):**

1. The student signs in to the web app **in a normal browser** (http://localhost:3003).
2. They press **Start exam in exam app**. The server creates a one-time token
   (valid 120 seconds, single use).
3. The browser tries to open `secure-exam://launch/<token>`, which opens the Electron app.
   In development the page also prints that link so you can paste it yourself.
4. The Electron app shows the student's email and a masked password, the student
   presses **Login**, and the exam starts in a locked-down window.
5. The API refuses to start/serve/save/submit an exam unless the request comes from
   the exam app (header `X-Client-Type: DESKTOP`).

Admins use the web app in a normal browser. Admins are *refused* inside the exam app.

You do **not** need the Electron app to run the API, the web app, the admin
features or the tests. You only need it to actually sit an exam.

---

## 2. Which operating system?

| OS | API, web app, tests, admin | Electron exam app | Notes |
|---|---|---|---|
| **Ubuntu / Debian Linux** | Yes | Yes | Best supported. The code sandbox (`bubblewrap`) and the kiosk scripts in `infra/linux-kiosk` are Linux-only. |
| **macOS** | Yes | Yes (development) | Developed and tested here. |
| **Windows 10/11 with WSL2 (Ubuntu)** | Yes | Yes, through WSLg (Windows' built-in Linux GUI) | **Recommended way to use Windows.** Follow the Linux instructions inside the Ubuntu terminal. |
| **Windows, native (PowerShell)** | Yes, with the workaround in 3.4 | Starts, **but "Run code" inside the exam app does not work** | Some npm scripts use Unix-only commands (`env -u`). See 3.4. The local code runner needs `which`, `bwrap` and POSIX paths, so it only works on Linux and macOS. |

Be aware:

- **Nothing in the Electron lockdown has been verified on Ubuntu or Windows by the
  authors.** It was exercised on macOS. If something looks wrong on Linux, say so.
- The **Linux** key-blocking and kiosk code exists; **Windows** has no platform
  security module yet (`apps/exam-client/src/main/platform/` only has `linux.ts`).
- Even on Windows, *coding questions can still be graded by the server* (it runs
  Python in Docker), so admins and the API side are fine.

---

## 3. Install the prerequisites

You need: **Git, Node.js (22.12 or newer), npm, Docker (with Compose v2)**. For the
Electron app on Linux you also need a few system libraries, and for running student
code in the exam app you need **Python 3** and **bubblewrap**.

### 3.1 Versions that matter

| Tool | Version | Why |
|---|---|---|
| Node.js | **22.12 or newer** (22 LTS or 24 are fine; developed on 24.10) | Vite 8 needs `^20.19 || >=22.12`, and the `electron` package declares `>=22.12`. **Node 18 and Node 20 will break the build.** The old "v18 or v20" advice was wrong. |
| npm | 10 or newer (ships with Node 22+) | Workspaces support. |
| Docker | Any recent Docker Engine or Docker Desktop with the `docker compose` command (Compose v2) | PostgreSQL, and the server-side code runner. |
| Git | Any recent | Cloning. |
| Python | 3.8+ (3.12 preferred) | Only for running student code *inside the exam app*. |

### 3.2 Ubuntu / Debian

```bash
# --- Git and build basics ---
sudo apt update
sudo apt install -y git curl ca-certificates build-essential

# --- Node.js 22 (NodeSource). Do not use the plain `apt install nodejs`: it is too old. ---
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # must print v22.12.0 or higher
npm -v     # must print 10.x or higher

# --- Docker Engine + Compose plugin ---
# Official instructions: https://docs.docker.com/engine/install/ubuntu/
# Quick way (convenience script):
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"     # lets you run docker without sudo
# LOG OUT AND LOG BACK IN (or run: newgrp docker), then check:
docker version
docker compose version               # note: "docker compose", with a space

# --- Python + bubblewrap (for "Run code" inside the exam app) ---
sudo apt install -y python3 bubblewrap
python3 --version
bwrap --version

# --- System libraries Electron needs (Ubuntu 22.04) ---
sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libgtk-3-0 libgbm1 libasound2 libxss1 libxtst6 libx11-xcb1 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2
# On Ubuntu 24.04 the packages with a 64-bit time_t were renamed:
#   libatk1.0-0 -> libatk1.0-0t64, libatk-bridge2.0-0 -> libatk-bridge2.0-0t64,
#   libcups2 -> libcups2t64, libasound2 -> libasound2t64
# A normal Ubuntu desktop already has most of these. If Electron later complains about
# "libXXX.so: cannot open shared object file", install the package that provides it.
```

Ubuntu 24.04 also blocks Electron's sandbox by default. See
[Troubleshooting](#14-troubleshooting) ("The SUID sandbox helper binary was found,
but is not configured correctly"). You will probably need that fix.

### 3.3 macOS

```bash
# Homebrew (skip if you have it): https://brew.sh
brew install git node@22 python@3.12
# node@22 is "keg-only": follow the "echo 'export PATH=...'" line brew prints, or:
brew link --overwrite --force node@22
node -v        # v22.12.0 or higher

# Docker: install Docker Desktop from https://www.docker.com/products/docker-desktop/
# Start it (whale icon in the menu bar must say "running"), then:
docker version
docker compose version
```

macOS has no `bubblewrap`. Student-code "Run" inside the exam app therefore needs the
development switch `EXAM_UNSANDBOXED_RUNNER=1` (section 10.4). This is for
development only and is **not a sandbox**.

### 3.4 Windows

**Option A (recommended): WSL2 with Ubuntu.** Everything then works like Linux.

1. Open PowerShell **as Administrator** and run: `wsl --install -d Ubuntu`, then reboot.
2. Open the **Ubuntu** app, create your Linux username and password.
3. Install **Docker Desktop for Windows** (https://www.docker.com/products/docker-desktop/),
   then in Docker Desktop: *Settings → Resources → WSL integration → enable Ubuntu*.
4. Inside the Ubuntu terminal follow [section 3.2](#32-ubuntu--debian) (skip the Docker
   install lines; Docker Desktop provides it). Check `docker version` works there.
5. **Clone the repo inside the Linux filesystem** (`cd ~`), *not* under `/mnt/c/...`.
   Under `/mnt/c` installs are very slow and file watching breaks.
6. Windows 11 (and Windows 10 with recent updates) shows Linux GUI apps via WSLg, so the
   Electron window opens on your desktop. Check with `wsl --version` (WSLg should be listed).
   If you have an old WSL, run `wsl --update`.
7. Open the folder in VS Code with the "WSL" extension (`code .` from the Ubuntu terminal).

Then use only the Linux commands in the rest of this guide, inside the Ubuntu terminal.

**Option B: native Windows (PowerShell).** Works for everything except running student
code inside the exam app.

1. Install with winget (PowerShell):
   ```powershell
   winget install --id Git.Git -e
   winget install --id OpenJS.NodeJS.LTS -e     # confirm: node -v must be >= v22.12.0
   winget install --id Docker.DockerDesktop -e
   winget install --id Python.Python.3.12 -e
   ```
   Close and reopen PowerShell afterwards so `PATH` refreshes. Start Docker Desktop.
   Check: `node -v`, `npm -v`, `git --version`, `docker version`, `docker compose version`.
2. If PowerShell refuses to run npm scripts ("running scripts is disabled on this
   system"), run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
3. **Fix the Unix-only npm scripts.** The Electron scripts contain `env -u ELECTRON_RUN_AS_NODE`,
   which does not exist in Windows' default shell (cmd.exe), so
   `npm run desktop:start`/`client:desktop` fail with "'env' is not recognized". Tell npm to use
   Git's Bash for scripts. Run this once:
   ```powershell
   npm config set script-shell "C:\Program Files\Git\bin\bash.exe"
   ```
   (Undo later with `npm config delete script-shell`.) Make sure `ELECTRON_RUN_AS_NODE` is
   not set in your Windows environment variables.
4. Windows does not use `VAR=value command` syntax; see the PowerShell form in section 10.
5. Git may convert line endings and break `.sh` files. Before cloning, run
   `git config --global core.autocrlf input`.
6. Free up the ports: 3000, 3003 and 5432 must be free (see Troubleshooting).

---

## 4. Get the code and install packages

```bash
git clone git@github.com:arnavmishra2005/secure-exam-platform.git
# or over HTTPS:  git clone https://github.com/arnavmishra2005/secure-exam-platform.git
cd secure-exam-platform
git checkout integrate/final      # the branch this guide describes
```

Install every package of every workspace in one go, **from the repo root**:

```bash
npm install
```

What this does, and why it matters:

- It installs dependencies for `apps/*` and `packages/*` into one root `node_modules/`.
- As a post-install step, the `electron` package **downloads the Electron binary**
  (about 100 MB, from GitHub). If that download is blocked, the install can look
  successful but Electron will be missing. Verify it right now:

```bash
npx electron --version
```

You should see `v44.9.3` printed in the terminal. **Type the `--version` part.** Running
plain `npx electron` (or double-clicking `Electron.app` in `node_modules`) opens Electron's
own welcome window ("To run a local app, execute the following on the command line"). That
window is *not* this project and *not* an error; it only means Electron was started without
an app. Close it. The real exam app is started only with the command in section 10.3.

If you see an error such as *"Electron failed to install
correctly, please delete node_modules/electron and try installing again"*, run:

```bash
node node_modules/electron/install.js
npx electron --version
```

(Do **not** use `npm install --ignore-scripts` or set `ELECTRON_SKIP_BINARY_DOWNLOAD`,
or the binary is never fetched. More in Troubleshooting.)

If `npm install` prints `EBADENGINE` warnings for Vite or Electron, your Node is too old.
Fix Node first (section 3.1), then delete `node_modules` and run `npm install` again.

---

## 5. Build the shared packages

This is the step people miss. `packages/types`, `packages/validation` and
`packages/api-client` are TypeScript libraries whose `package.json` points at
`dist/index.js`. **`dist/` does not exist after cloning** (it is git-ignored). Until you
build, the API, its tests, the migration commands and the seed all fail with errors like:

```
Cannot find module '@secure-exam/types'
Cannot find module '@secure-exam/validation'
Module not found: Can't resolve '@secure-exam/api-client'
```

Build all three with one command:

```bash
npm run typecheck
```

Despite its name this **builds** them (it writes `dist/`). It is the same as running
these three, **in this order** (`validation` and `api-client` depend on `types`):

```bash
npm run build --workspace=packages/types
npm run build --workspace=packages/validation
npm run build --workspace=packages/api-client
```

(`--workspace=@secure-exam/types` and `--workspace=packages/types` are the same thing.)

Check it worked; all three folders should exist:

```bash
ls packages/types/dist packages/validation/dist packages/api-client/dist
# Windows PowerShell:  dir packages\types\dist, packages\validation\dist, packages\api-client\dist
```

**Run `npm run typecheck` again whenever** you change anything under `packages/types`,
`packages/validation` or `packages/api-client`, and after pulling changes that touch
them. `packages/exam-content-ui` does **not** need a build: it is used from source.
The web app also reads `types`, `api-client` and `exam-content-ui` from source, but the
**API needs the built `dist/`**.

---

## 6. Create the `.env` files

`.env` files hold local configuration and are git-ignored, so each person creates their
own. Create the three below by copying the examples. Run from the repo root.

**Linux / macOS / WSL / Git Bash:**
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/admin-web/.env.example apps/admin-web/.env    # only for the legacy admin portal
```

**Windows PowerShell:**
```powershell
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\web\.env.example apps\web\.env
Copy-Item apps\admin-web\.env.example apps\admin-web\.env
```

(The legacy student UI also has `apps/exam-client/renderer/.env.example`; copy it to `.env`
only if you plan to run `npm run client:dev`.)

### 6.1 `apps/api/.env` (required)

The defaults work for local development **as they are**. Make sure this line contains
`app://exam` (the example file already does; older copies of the file may not):

```env
CORS_ORIGIN=http://localhost:3001,http://localhost:3002,http://localhost:3003,app://exam
```

The most important variables:

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgres://exam_user:exam_pass@localhost:5432/secure_exam` | Must match `docker-compose.yml` (user `exam_user`, password `exam_pass`, db `secure_exam`). |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | `change-me-...` | Each must be **at least 16 characters** or the API refuses to start. Change them for anything not local. |
| `CORS_ORIGIN` | see above | Comma-separated list of origins allowed to call the API. Required. |
| `REQUIRE_DESKTOP_CLIENT` | `true` | `true`: exams only work from the Electron exam app. `false`: a browser can sit exams (quick development without the app; also set the web switch to `false`). |
| `EXAM_LAUNCH_TTL_SECONDS` | `120` | How long a launch token lives. |
| `VIOLATION_FLAG_THRESHOLD` | `5` | Violations before an attempt is flagged. |
| `CODING_GRADING_MODE` | `DEFERRED` | `DEFERRED` grades code after the attempt ends; `LIVE` grades on submit. |
| `RUNNER_DOCKER_BIN`, `RUNNER_PYTHON_IMAGE` | `docker`, `python:3.12-slim` | The server runs student code in this Docker image. |
| `THROTTLE_LIMIT` | `1000` | Global rate limit. Login is separately limited to **5 per minute per IP**. |
| `ALLOW_ADMIN_ON_DESKTOP` | unset (false) | Set `true` only to test an admin account inside the exam app. |

If an `.env` value is invalid, the API stops at start-up and prints which one
(`Config validation error: ...`).

### 6.2 `apps/web/.env`

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_HEARTBEAT_INTERVAL_MS=15000
VITE_REQUIRE_DESKTOP_EXAM=true
```

These are baked in when Vite starts. **After editing, stop and restart `npm run web:dev`.**

### 6.3 `apps/admin-web/.env` (legacy portal only)

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

This is baked in at build time; rebuild after changing it.

### 6.4 Environment variables for the Electron app

The exam app takes its settings from environment variables of the shell you launch it
from (not from a `.env` file):

| Variable | Default | Meaning |
|---|---|---|
| `EXAM_API_URL` | `http://localhost:3000` | Where the API is. |
| `EXAM_WEB_URL` | `http://localhost:3003` | Where the web dev server is. |
| `EXAM_LAUNCH_LINK` | none | `secure-exam://launch/<token>`. Development shortcut; see 10. |
| `INVIGILATOR_PIN` | `1234` in development | PIN needed to leave an exam in progress. |
| `EXAM_UNSANDBOXED_RUNNER` | unset | Set to `1` to run student code without bubblewrap (development only). |

---

## 7. Start PostgreSQL

Docker must be running (Linux: `sudo systemctl status docker`; macOS/Windows: Docker
Desktop open and "running").

```bash
docker compose up -d postgres
docker compose ps
```

`docker compose ps` must show `postgres` as `running (healthy)`. If it says
`starting`, wait ten seconds and run it again. (A warning that the `version` attribute
is obsolete is harmless.)

If your system only has the old `docker-compose` command, use `docker-compose` instead.
If you do not want Docker for the database, see 7.1.

### 7.1 Alternative: PostgreSQL installed without Docker

Install PostgreSQL 16 (`sudo apt install postgresql` / `brew install postgresql@16` /
the Windows installer), then create the same user and database as the compose file:

```bash
sudo -u postgres psql -c "CREATE USER exam_user WITH PASSWORD 'exam_pass';"
sudo -u postgres psql -c "CREATE DATABASE secure_exam OWNER exam_user;"
```

Keep `DATABASE_URL` as it is, or change it to match your own credentials. You still need
Docker for the server-side code runner (section 8.3), but not for anything else.

---

## 8. Migrate and seed the database

### 8.1 Run the migrations **before** the API has ever started

```bash
npm run migration:run
```

This applies all 25 migrations. It prints each one and ends without error.

> **Order matters.** In development the API auto-creates tables (`synchronize: true`). If
> the API starts on an empty database *before* you migrate, the tables already exist and
> the migrations fail with `relation "..." already exists`. If you hit that, jump to
> [13](#13-reset-everything--stop-everything) to reset the database and start from this step.

### 8.2 Seed development data (optional but recommended)

```bash
npm run db:seed
```

It is safe to repeat. It creates:

| Account | Email | Password |
|---|---|---|
| Admin | `admin@secure-exam.dev` | `Admin@1234` |
| Student | `alice@secure-exam.dev` | `Student@1234` |
| Student | `bob@secure-exam.dev` | `Student@1234` |
| Student | `carol@secure-exam.dev` | `Student@1234` |

It also creates a course `CS201` (students enrolled) and an **ACTIVE** exam with ID
`11111111-1111-4111-8111-111111111111`: five multiple-choice questions plus one coding
question ("Merge Intervals", 10 marks, 2 sample and 8 hidden tests). Re-running the seed
moves the exam's time window forward, resets those users' passwords, and re-adds the coding
question if missing. **Never run the seed against shared or production data.**

> There is no API endpoint to create an admin. Without the seed you must insert one by
> hand; see "The API can't create an admin" in [CLAUDE.md](CLAUDE.md).

### 8.3 Pull the Python image used for server-side code grading

```bash
docker pull python:3.12-slim
```

The API runs student code for coding questions inside this Docker image. If you skip this
(or Docker is not running when the API needs it), everything else works, but coding
questions cannot be run or graded on the server.

---

## 9. Start the API and the web app

The shortcut is `npm run dev`, which starts both below in one terminal (output is prefixed
`api` / `web`; Ctrl+C stops both). To run them separately, use one terminal per process and
leave them running.

**Terminal 1: API**
```bash
npm run api:start
```
Wait for `Nest application successfully started`. Then check:

- http://localhost:3000/health → shows an OK status
- http://localhost:3000/api/docs → Swagger UI

**Terminal 2: web app**
```bash
npm run web:dev
```
Open http://localhost:3003. Sign in as `admin@secure-exam.dev` / `Admin@1234` for the
admin view, or `alice@secure-exam.dev` / `Student@1234` for the student view.

If you changed anything in `packages/`, run `npm run typecheck` (section 5) **and restart
the API**.

> Login is limited to 5 attempts per minute per IP. If you get "Too many requests", wait a minute.

---

## 10. Run the Electron exam app

**Short version:** `npm run exam:app` (see the Quick start). The rest of this section explains
what it does and how to do it by hand.

**Why the token?** In production the student signs in in the browser and presses "Start exam
in exam app". The server issues a one-time, 120-second token and the browser opens
`secure-exam://launch/<token>`, which the operating system hands to the *installed* exam app,
so the password never reaches the app. During development no app is installed, so the OS cannot
open that link. `npm run exam:app` fetches the token for you and starts the app with it.
(By hand you would copy the link the web page shows and pass it as `EXAM_LAUNCH_LINK`, 10.3.)

Both lock switches must be `true` (they are in `.env.example`): `REQUIRE_DESKTOP_CLIENT` in
`apps/api/.env` and `VITE_REQUIRE_DESKTOP_EXAM` in `apps/web/.env`. Restart `npm run dev`
after changing them.

Prerequisites: sections 4–9 done (API and web app running, database seeded), and
`npx electron --version` printing `v44.9.3`.

### 10.1 Compile the Electron main process (`exam:app` does this for you)

```bash
npm run desktop:compile
```

This writes `apps/exam-client/dist/`. If it is missing, the app cannot start.

### 10.2 Get a launch link

1. In the browser, open http://localhost:3003 and sign in as **a student**
   (`alice@secure-exam.dev` / `Student@1234`).
2. Open the exam and press **Start exam in exam app**.
3. In development the page shows the link, which looks like
   `secure-exam://launch/<long-token>`. Copy it. **It expires after 120 seconds and works
   only once.** If it expires, press the button again to get a new one.

### 10.3 Launch the app with that link (what `npm run exam:app` automates)

Open a **third terminal** (the API and web terminals stay running) at the repo root.

**Linux / macOS / WSL / Git Bash:**
```bash
EXAM_UNSANDBOXED_RUNNER=1 \
EXAM_LAUNCH_LINK="secure-exam://launch/PASTE_TOKEN_HERE" \
npm run desktop:start --workspace=@secure-exam/exam-client-desktop
```

On Linux with `bwrap` installed you can leave out `EXAM_UNSANDBOXED_RUNNER=1`.

**Windows PowerShell (after the one-time `script-shell` step in 3.4):**
```powershell
$env:EXAM_UNSANDBOXED_RUNNER = "1"
$env:EXAM_LAUNCH_LINK = "secure-exam://launch/PASTE_TOKEN_HERE"
npm run desktop:start --workspace=@secure-exam/exam-client-desktop
```

**Windows cmd.exe:**
```bat
set EXAM_UNSANDBOXED_RUNNER=1
set EXAM_LAUNCH_LINK=secure-exam://launch/PASTE_TOKEN_HERE
npm run desktop:start --workspace=@secure-exam/exam-client-desktop
```

What should happen:

1. A window opens on the **launch screen** showing the student's email and a masked
   password, with readiness checks.
2. Press **Login**. The exam starts in a full-screen locked window.
3. Reload, quit, DevTools and similar keys are blocked, and each attempt is recorded
   as a violation that admins can see.
4. After **Submit**, only an "Exam submitted" screen with **Close** remains
   (it closes itself after 30 seconds).
5. To leave an exam in progress during development, use the invigilator PIN `1234`.

`npm run desktop:start` does not start the web app or API; they must already be running.

### 10.4 About running student code in the exam app

The exam app runs "Run" / "Run samples" on the student's own computer:

- **Linux:** needs `python3` and `bubblewrap` (`bwrap`); the code then runs in a real
  sandbox. If `bwrap` is missing you get *"Cannot run code on this computer: the sandbox
  (bubblewrap) is not installed."*
- **macOS:** no bubblewrap exists. Use `EXAM_UNSANDBOXED_RUNNER=1` and have `python3` on
  your PATH. This is a development convenience, **not a sandbox**.
- **Windows (native):** not supported (needs `which`, `bwrap` and POSIX paths). Use WSL2.
- Not using the app's runner? In development the API can run code itself in Docker
  (`CODING_SERVER_RUN` defaults to on outside production).

### 10.5 The all-in-one development command (not for exam testing)

```bash
npm run client:desktop
```

This compiles, starts the Vite dev server on port 3003, waits for it, and opens
Electron. Do **not** also run `npm run web:dev`, or two Vite servers fight for port 3003.
It does not do the browser launch flow, so use sections 10.2 and 10.3 to test the real
exam flow.

### 10.6 Packaging (optional, untested on Ubuntu)

```bash
npm run desktop:build
```

Builds the app and web bundle with `electron-builder` for Linux (AppImage and `.deb`) into
`apps/exam-client/dist-electron/`. A packaged build serves the UI from `app://exam`, so
`CORS_ORIGIN` must include `app://exam`. Linux-only target; the kiosk install scripts are
described in [infra/linux-kiosk/README.md](infra/linux-kiosk/README.md).

---

## 11. Development shortcuts

Edit `apps/api/.env`, then **restart the API**:

| Goal | Setting |
|---|---|
| Sit an exam in a normal browser (no Electron, no kiosk) | API: `REQUIRE_DESKTOP_CLIENT=false` **and** web: `VITE_REQUIRE_DESKTOP_EXAM=false` (restart both) |
| Use an admin account inside the exam app | API: `ALLOW_ADMIN_ON_DESKTOP=true` |
| Run student code without bubblewrap | Environment of the Electron process: `EXAM_UNSANDBOXED_RUNNER=1` |
| Grade code on submit instead of afterwards | API: `CODING_GRADING_MODE=LIVE` |

---

## 12. Tests, lint and builds

All run from the repo root, and none of them need a database.

| What | Command |
|---|---|
| API unit tests (Jest) | `npm run api:test` |
| One API test file | `npm test --workspace=apps/api -- timer.service` |
| Web app tests (Vitest) | `npm run web:test` |
| Exam content UI tests | `npm run content-ui:test` |
| Electron main-process tests | `npm run desktop:test` |
| Legacy exam client tests | `npm run client:test` |
| API lint | `npm run api:lint` |
| Type-check web / content-ui | `npm run web:typecheck`, `npm run content-ui:typecheck` |
| Type-check API (no output files) | `npx tsc --noEmit -p apps/api` |
| Build the API | `npm run api:build` |
| Build the web app | `npm run web:build` |

**Build the shared packages first (`npm run typecheck`)** or the API tests fail with
`Cannot find module '@secure-exam/...'`.

Migrations: `npm run migration:run` applies, `npm run migration:revert` undoes the last one.
Never edit a migration that others have run; add a new one.

---

## 13. Reset everything / stop everything

**Stop the services.** Press `Ctrl+C` in the API and web terminals. If a process is stuck:

```bash
# Linux / macOS
pkill -f "nest start"; pkill -f "node dist/main"; pkill -f vite; pkill -f electron
lsof -i :3000 -i :3003 -i :5432      # who is holding the ports
```
```powershell
# Windows PowerShell
netstat -ano | findstr ":3000 :3003 :5432"
taskkill /PID <pid> /F
```
(`nest start` leaves a child `node dist/main` running, so kill both.)

**Stop the database but keep its data:** `docker compose stop postgres`

**Wipe the database completely** (deletes **all** local data):
```bash
docker compose down -v
docker compose up -d postgres
npm run migration:run
npm run db:seed
```

**Reinstall from scratch** (fixes most "weird" dependency problems):
```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/exam-client/renderer/node_modules
npm install
node node_modules/electron/install.js
npm run typecheck
npm run desktop:compile
```
(Windows PowerShell: `Remove-Item -Recurse -Force node_modules` and the same for the others.)
Do not delete `package-lock.json`.

---

## 14. Troubleshooting

### Node, npm and installing

| Symptom | Cause and fix |
|---|---|
| `EBADENGINE` warnings, or `SyntaxError`/`Unexpected token` while building | Node is too old. Install Node 22.12+ (section 3.1), delete `node_modules`, run `npm install`. |
| `node: command not found` / `npm: command not found` | Node not installed or not on `PATH`. Reopen the terminal; on macOS check `brew link node@22`. |
| `EACCES: permission denied` during `npm install` on Linux | Never use `sudo npm install`. Fix ownership: `sudo chown -R "$USER" ~/.npm .` then retry. |
| `npm ERR! network` / timeouts / `ECONNRESET` | Network or proxy. Retry; behind a proxy set `npm config set proxy http://host:port` and `https-proxy`. |
| `gyp ERR!` while installing (bcrypt etc.) | Missing build tools. Ubuntu: `sudo apt install build-essential python3`. macOS: `xcode-select --install`. Windows: install "Desktop development with C++" from the Visual Studio Build Tools. |

### "Cannot find module '@secure-exam/...'"

You have not built the shared packages (or changed them since). Run:

```bash
npm run typecheck
```

or, one at a time and in this order:

```bash
npm run build --workspace=packages/types
npm run build --workspace=packages/validation
npm run build --workspace=packages/api-client
```

If a build itself fails with `Cannot find module '@secure-exam/types'`, build `types` first.
If it still fails, the install is incomplete; run `npm install` at the root again.

### Electron

| Symptom | Fix |
|---|---|
| `Electron failed to install correctly, please delete node_modules/electron and try installing again` | The binary was never downloaded. Run `node node_modules/electron/install.js`. If that fails, you are probably offline or blocked from github.com; set `ELECTRON_MIRROR` to a reachable mirror (for example `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` on Linux/macOS, `$env:ELECTRON_MIRROR="..."` in PowerShell), delete `node_modules/electron`, and run `npm install` again. |
| `npx electron --version` fails or `node_modules/electron/dist` is missing | Same as above. Also make sure you did not install with `--ignore-scripts` and that `ELECTRON_SKIP_BINARY_DOWNLOAD` is not set. Antivirus can also delete the download: re-run the install script. |
| The app starts and immediately behaves like Node, or `Electron --version` prints a Node error; `ELECTRON_RUN_AS_NODE` is set | Some terminals/IDEs set `ELECTRON_RUN_AS_NODE=1`. The npm scripts already remove it with `env -u ELECTRON_RUN_AS_NODE`. Run `unset ELECTRON_RUN_AS_NODE` (PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`). |
| Windows: `'env' is not recognized as an internal or external command` | The Electron npm scripts use `env -u` (Unix). Run `npm config set script-shell "C:\Program Files\Git\bin\bash.exe"` (section 3.4) or use WSL2. |
| A window titled "Electron" opens showing the Electron logo, the versions and "To run a local app, execute the following on the command line: ... path-to-app" | Electron was started **with no app**, so it shows its built-in welcome page. Causes: you ran plain `npx electron` (not `--version`), ran the `Electron` binary directly, or ran `electron` from the wrong folder. Close the window (`Cmd+Q` / `pkill -f node_modules/electron/dist`) and start the exam app only with `npm run desktop:start --workspace=@secure-exam/exam-client-desktop` from the repo root (section 10.3). If the exam app itself opens this page, `apps/exam-client/dist/main/main.js` is missing: run `npm run desktop:compile`. |
| Cannot find `dist/main/main.js` | Run `npm run desktop:compile` (section 10.1). |
| Linux: `The SUID sandbox helper binary was found, but is not configured correctly` or `No usable sandbox!` | Common on Ubuntu 24.04, which restricts unprivileged user namespaces. Pick **one**: (a) `sudo chown root:root node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 node_modules/electron/dist/chrome-sandbox` (redo after reinstalling Electron), or (b) `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` (resets on reboot). Do **not** use `--no-sandbox` for real exams. |
| Linux: `error while loading shared libraries: libnss3.so` (or `libgbm`, `libgtk-3`, `libasound`...) | A system library is missing. Install the packages in section 3.2 (note the `t64` names on Ubuntu 24.04). |
| Linux/WSL: `Missing X server or $DISPLAY` / window never appears | You have no graphical session (SSH, a server install). Run from the desktop, or on WSL use Windows 11/WSLg and `wsl --update`. |
| Nothing happens when the browser opens `secure-exam://...` | In development the OS has no registered handler. Copy the link the page shows and start the app yourself with `EXAM_LAUNCH_LINK` (10.3). |
| The launch screen says the link is invalid, expired or already used | Tokens last 120 seconds and work once. Press **Start exam in exam app** again for a new link. |
| "Cannot run code on this computer: the sandbox (bubblewrap) is not installed." | Linux: `sudo apt install bubblewrap`. macOS/dev: set `EXAM_UNSANDBOXED_RUNNER=1`. Windows: use WSL2. |
| Readiness check fails about the API | The API is not running at `EXAM_API_URL` (default `http://localhost:3000`) or `CORS_ORIGIN` lacks `app://exam`. |
| macOS says the app is damaged/unverified | Electron 44.9.3 is unsigned by design. Expected for development. |
| Admin login fails inside the exam app | By design. Set `ALLOW_ADMIN_ON_DESKTOP=true` in `apps/api/.env` for development. |

### Database and API

| Symptom | Fix |
|---|---|
| `Cannot connect to the Docker daemon` | Docker is not running. Start Docker Desktop, or `sudo systemctl start docker`. |
| `permission denied while trying to connect to the Docker daemon socket` (Linux) | `sudo usermod -aG docker "$USER"`, then log out and back in. |
| `docker: 'compose' is not a docker command` | Install the Compose v2 plugin (`sudo apt install docker-compose-plugin`) or use `docker-compose`. |
| `port is already allocated` / `address already in use` on 5432 | A local PostgreSQL is using the port. Stop it (`sudo systemctl stop postgresql`) or change the mapping in `docker-compose.yml` (`"5433:5432"`) and use port 5433 in `DATABASE_URL`. |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL is not up yet or not running: `docker compose ps`, wait for `healthy`. |
| API exits with `Config validation error: "JWT_ACCESS_SECRET" length must be at least 16` | Your `.env` is missing or has short secrets; recopy from `.env.example`. |
| `relation "..." already exists` during `migration:run` | The API ran before the migrations. Reset the database (section 13). |
| `relation "..." does not exist` when the API starts | You have not run `npm run migration:run`. |
| `password authentication failed for user "exam_user"` | The Postgres volume was created with other credentials. Reset with `docker compose down -v` (deletes local data). |
| `EADDRINUSE :::3000` | Another API is still running. Kill it (section 13). |
| `Too Many Requests` (HTTP 429) on login | Login is capped at 5/minute per IP. Wait one minute. |
| CORS error in the browser console | Add the web origin to `CORS_ORIGIN` in `apps/api/.env` and restart the API. Origins have no trailing slash. |
| Starting an exam says the exam app is required | Intended: exams run in the exam app (`npm run exam:app`, section 10). To sit one in a browser instead, set `REQUIRE_DESKTOP_CLIENT=false` in `apps/api/.env` and `VITE_REQUIRE_DESKTOP_EXAM=false` in `apps/web/.env`, then restart. |
| Coding question cannot be run/graded on the server | Docker not running, or image missing: `docker pull python:3.12-slim`. |

### Web app

| Symptom | Fix |
|---|---|
| Blank page / "Network Error" | The API is not running, or `VITE_API_BASE_URL` is wrong. Restart `npm run web:dev` after editing `.env`. |
| Vite says `Port 3003 is in use` and picks another port | An old Vite is still running; stop it. The Electron app expects 3003. |
| Changed `.env` but nothing changed | Vite reads `.env` at start-up only. Restart it. |
| Windows: file changes are not noticed | Repo is on `/mnt/c` in WSL. Move it into `~` in Linux. |

---

## 15. Docker Compose for the full stack (not recommended yet)

```bash
docker compose up --build
```

This is **known not to work out of the box**: `apps/api/.env` points `DATABASE_URL` at
`localhost` (the compose file overrides it, but see the next point), the API Dockerfile does
not build the shared packages before building the API, and the final image copies
`node_modules` without `packages/`, which breaks the `@secure-exam/*` links. It also does
not include the web app or the Electron app. Use the local workflow in this guide.
For just the database, use `docker compose up -d postgres`.

---

## 16. Project layout and further reading

```
apps/api                       NestJS API
apps/web                       Admin + student UI (Vite, port 3003)
apps/exam-client/src           Electron main + preload code (the exam app)
apps/exam-client/renderer      legacy student UI (port 3002)
apps/admin-web                 legacy Next.js admin portal (port 3001)
packages/types                 shared types              (needs build)
packages/validation            shared DTOs               (needs build)
packages/api-client            axios API wrappers        (needs build)
packages/exam-content-ui       shared exam UI + Monaco editor (used from source)
docs/                          design notes and contracts
infra/linux-kiosk              Linux kiosk session, firewall and USB-block scripts
```

- [CLAUDE.md](CLAUDE.md): architecture, invariants and gotchas (the most detailed reference).
- [docs/kiosk-integration.md](docs/kiosk-integration.md): the exam app design, what has been verified and what has not.
- [docs/local-code-runner.md](docs/local-code-runner.md): the student-code sandbox contract.
- [docs/phase4-contracts.md](docs/phase4-contracts.md): shared API contracts.
- [infra/linux-kiosk/README.md](infra/linux-kiosk/README.md): installing the Linux kiosk session.

### One-page cheat sheet (Linux / macOS)

```bash
git clone git@github.com:arnavmishra2005/secure-exam-platform.git && cd secure-exam-platform
git checkout integrate/final
npm install
npx electron --version                      # expect v44.9.3; else: node node_modules/electron/install.js
npm run typecheck                           # builds types, validation, api-client
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d postgres               # wait for "healthy"
docker pull python:3.12-slim
npm run migration:run                       # BEFORE the API has ever run
npm run db:seed
npm run dev                                 # terminal 1: API + web app
npm run exam:app                            # terminal 2: exam app, signed in as alice, no pasting
```
