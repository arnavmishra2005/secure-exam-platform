# Running a demo over the college wifi

One laptop is the server. Everyone else on the same network uses it: staff and students in a
browser, and students in the exam app (run from source) for the exam itself, with the full
lockdown and violation logging. This is for demos and testing. A real exam needs the server
setup in `infra/intranet` (HTTPS, a dedicated machine, a separate code runner).

```
 teammate laptops (same wifi)                     server laptop
 ───────────────────────────                      ──────────────────────────────────
 browser ── http://<ip>:3003 ───────────────────▶ website (vite preview, port 3003)
 exam app ─ http://<ip>:3003 and /api ──────────▶   └─ /api ─▶ API (127.0.0.1:3000) ─▶ Postgres
                                                                └─ Docker (grades code)
```

Everything goes through one address, `http://<ip>:3003`. The API listens only on the laptop
itself, so nobody reaches it except through `/api`, and it reads each person's real address from
that proxy (per-student login limits and logs work).

## On the server laptop

1. Start Postgres (as for development) and Docker Desktop (grading code needs it).
2. Stop `npm run dev` / `api:start` / `web:dev` if they are running (they use the same ports).
3. Run:

   ```bash
   npm run lan
   ```

   It builds the website, starts the API and the website, keeps the Mac awake, and prints the
   address, e.g. `http://10.50.33.112:3003`. Keep the window open and the laptop on power.
   With several networks or a VPN, pick the address: `npm run lan -- --ip 10.50.33.112`.
4. macOS asks whether `node` may accept incoming connections: allow it.
5. From a phone or another laptop on the wifi, open `http://<ip>:3003/api/health`. It should
   show `{"status":"ok"}`. If it times out, the wifi blocks devices from reaching each other
   (common on college and guest networks): use a phone hotspot or a router you control.

Students for the demo come from `npm run db:seed-students` (password `Student@1234`).

## On each teammate's laptop (once)

They need this repository at the same version, with `npm install` done. No database or API.

```bash
git pull
npm install
npm run exam:register -- --server http://<ip>:3003
```

This points their `secure-exam://` launcher (what the browser's Start exam button opens) at the
server laptop. If the server's address changes (a new wifi session), run the same command with
the new address.

## Taking an exam

1. Instructors open `http://<ip>:3003` in a browser, enrol students and open the exam. The exam
   app refuses staff logins.
2. A student opens `http://<ip>:3003` in a browser, signs in, opens the exam and presses Start.
   The browser opens the exam app, which shows their email and a masked password. Login starts
   the exam, locked down.
3. The invigilator exit PIN is `1234` (development builds).

## Limits of this setup

- The laptop is a single point of failure: if it sleeps, loses wifi or its battery dies, every
  student's saves queue up on their machine until it is back.
- Plain HTTP on a shared network: fine for a demo with test accounts, not for real exams.
- Run (trying code) happens on the student's machine: Python on macOS runs without a sandbox
  (development only); Ubuntu needs bubblewrap. C, C++ and Java run on the server laptop's
  Docker instead, after building the images once: `npm run runner:images --workspace=apps/api`.
- `vite preview` and one API process are sized for a class demo, not hundreds of students.
