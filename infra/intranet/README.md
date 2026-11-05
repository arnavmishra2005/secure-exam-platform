# College LAN deployment

This recipe serves the unified web app over HTTPS and strips `/api` before
proxying to Nest. It includes PostgreSQL and a migration job. Run on the exam
server after reviewing the settings; do not load-test a real exam or build these
images while using a memory-constrained lab laptop.

## Prepare the server

1. Reserve static DNS/IP (e.g. `exam.college.local`); synchronize server and lab
   machines to the college NTP source. Make the lab VLAN reach only port 443.
2. Copy `.env.example` to `.env`; replace all secrets, set a URL-encoded database
   password in DATABASE_URL, and configure the actual CORS origins and lab CIDRs.
   `app://exam` is required for packaged Electron. An empty EXAM_ALLOWED_CIDRS
   disables the allowlist. Invalid CIDRs fail configuration validation.
3. Place the internal-CA certificate and private key in `tls/server.crt` and
   `tls/server.key`, including the certificate chain. Restrict key permissions.
   Install the CA in both the operating system and browser trust stores on lab
   machines. Do not disable certificate validation in Electron.
4. Prepare B's sandbox runner on a separate rootless Docker host. The API image
   includes Docker/SSH clients; for the SSH example in `.env`, mount a dedicated
   key and verified known_hosts into `/home/node/.ssh` read-only, readable by
   UID 1000. Add these mounts in a local Compose override. Use a restricted
   runner account without access to the database or application secrets. For
   Docker-over-TLS instead, mount its client certificates and set the Docker TLS
   variables. Never use unauthenticated TCP. Do not mount the host's privileged
   Docker socket into the API just to make the example work.
5. Pre-pull/build the runner images and pin the approved digest. Import application
   images, PostgreSQL and runner images using `docker save`/`docker load` or a LAN
   registry. Build dependencies need an npm/OS mirror or internet on a separate
   build machine; exam-time runtime does not need internet.
6. From this directory run `docker compose up -d --build`. On an offline server
   use images built/imported beforehand and `docker compose up -d --no-build`.
   Assign image tags in a local override to match the imported application images.
   The migration job must succeed before API startup. For upgrades back up first,
   stop API writers, rerun the migration job, then recreate API/web.

The recipe starts **one API process**. The current grader and throttler have
in-memory coordination. Before using multiple API processes (the plan's capacity
target), merge a shared job queue/claiming and distributed rate/concurrency
limits; otherwise multiple graders can claim the same work and total runner
concurrency can exceed its limit. Do not scale this Compose API blindly.

## Runtime URLs and lab installation

Web defaults to `/api` in `apps/web/public/runtime-config.js`. You can replace
that static file at deployment with `window.__EXAM_CONFIG__ = { apiBaseUrl: ... }`
without rebuilding. It is served without caching. Nginx strips `/api/`; Nest
keeps its existing routes. Only nginx is exposed, and it overwrites forwarded
addresses; `TRUST_PROXY_HOPS=1` is appropriate for this topology. Set 0 when the
API has no trusted proxy. Extra proxies require a deliberate topology review.

Install `desktop-config.example.json` as `/etc/secure-exam/config.json` on each
lab machine, containing its HTTPS API URL including `/api`. The packaged app
gets that URL from main-process IPC; `EXAM_CONFIG_PATH` selects another config
file and `EXAM_API_URL` is an explicit installation/environment override.
Development still defaults to `http://localhost:3000`. Configure the file before
starting a packaged app; missing/invalid/non-HTTPS production URLs fail closed.

Reuse `../linux-kiosk` provisioning for kiosk controls. When B's compiled
languages are merged, install their compiler/JDK packages and verify B's local
sandbox self-test before enabling them. Current code stays Python-only.

## Backups

`bash backup.sh /mnt/remote-exam-backups` writes a timestamped compressed pg_dump
with restrictive permissions. `/mnt/remote-exam-backups` must be storage on
another machine, not merely a directory on the database host. Schedule it with
IT's scheduler (e.g. nightly cron, with this directory as its working directory).
Encrypt/restrict access to backups and set a retention policy. Rehearse restoring
into a disposable database with `gunzip -c BACKUP | psql ...` before relying on
it. Never test restore by overwriting the live exam database.

## Deployment acceptance (requires real hosts)

- [ ] Certificate chain trusted; `https://HOST/api/health` succeeds from the lab.
- [ ] Migrations applied and API boot/runner health checked.
- [ ] Captcha, login, Monaco, fonts, saves, Submit, review and grading work with
      the WAN physically blocked. No CDN or public captcha service is used.
- [ ] Outside-LAN access denied; forwarded-header spoof cannot bypass CIDRs.
- [ ] Backups reach another machine and a disposable restore succeeds.
- [ ] Two-device approval rehearsal passes (see `docs/phase5-person-c.md`).
- [ ] On a rehearsal exam, create distinct bound desktop sessions/attempts and
      export `{token,attemptId,questionId,optionId,codingQuestionId?}` records into
      a local `attempts.json`. Protect this file like credentials and delete it
      after the rehearsal. Run k6 from a designated load generator:

  ```bash
  k6 run -e BASE_URL=https://exam.college.local/api -e STUDENTS=300 \
    -e DATA_FILE=./attempts.json load-test.js
  ```

  Use at least one distinct fixture per virtual student. Start small, increase
  deliberately, monitor RAM/CPU/DB/runner queue, and record p95 latency/failures.
  Set TEST_CODE_RUN=true only on a rehearsal deployment with server Run enabled
  and B's sandbox ready. Assess grading backlog after simultaneous final submits
  as a separate acceptance step. The example exercises saves/heartbeat/practice;
  it does not certify capacity by itself.
