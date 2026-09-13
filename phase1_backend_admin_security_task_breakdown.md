# Phase 1 Deep-Dive: Backend + Admin Portal + Security Layer (No Kiosk)
### Task Breakdown for a 3-Person Team

---

## 1. What "Security Layer minus Kiosk" Means Here

From the README's security architecture, everything **except OS Kiosk and Electron** belongs in Phase 1:

```
Backend Security Responsibilities (Phase 1 scope)
--------------------------------------------------
Authentication (login, sessions/tokens, RBAC)
Exam authorization (can this user access this exam?)
Attempt validity (is this attempt real, owned, active?)
Server-side timer authority (client clock cannot be trusted)
Answer persistence integrity
Submission validation
Audit logging (immutable trail of every sensitive action)
Transport security (HTTPS, secure headers, CORS)
Input validation & sanitization
Rate limiting / brute-force protection
Secrets & config management
```

Explicitly **out of scope for Phase 1**: OS-level kiosk, Electron window/navigation/clipboard/DevTools restrictions, focus-loss detection (all Phase 4/5 — those need the desktop shell).

---

## 2. Day 0 — Shared Foundation (All 3, together, ~half to 1 day)

Before splitting up, agree on and scaffold this together so everyone can then work independently:

- Monorepo structure (`apps/api`, `apps/admin-web`, `packages/types`, `packages/validation`, `packages/api-client`, `database/migrations`).
- NestJS app skeleton with module registration pattern agreed (one folder per domain module).
- Next.js admin app skeleton with route/folder ownership agreed (see section 5).
- PostgreSQL connection + migration tool setup (e.g. TypeORM/Prisma — pick one).
- Shared `packages/types`: base entity interfaces (Student, User, Exam, Question, Attempt, Answer, AuditEvent) — **fields only, no logic**, so everyone codes against the same shapes.
- Shared `packages/validation`: DTO validation approach (class-validator or zod) agreed.
- Git branching strategy: one feature branch per module, PRs into `develop`, short-lived branches.
- CI skeleton (lint + build + test on PR) in GitHub Actions.
- Agree on the **Auth contract** up front (see Person A below) since B and C's endpoints depend on it — this is the one thing that can't be fully parallelized; a stub/interface is enough to unblock B and C on Day 0.

Once this is in place, each person owns a **vertical slice** (their own backend module(s) + their own admin-portal screens + their own tests), which minimizes merge conflicts because NestJS modules and Next.js route folders are naturally separate files/directories.

---

## 3. Person A — Identity, Auth & Security Core

**Owns the foundation everyone else depends on — should ship the Auth guard/contract first, even as a stub, so B and C aren't blocked.**

### Backend
- **Auth module**
  - Login endpoint, JWT access + refresh token issuance, token revocation/logout.
  - RBAC guards/decorators (`@Roles('admin' | 'student')`) usable by any controller.
  - Password hashing (bcrypt) for local accounts; interface/adapter left open for OIDC/SAML/LDAP later.
- **Security middleware / cross-cutting concerns**
  - Helmet (secure headers), CORS configuration, global validation pipe.
  - Rate limiting on auth endpoints (`@nestjs/throttler` or similar) — brute-force protection.
  - Centralized exception filter (no stack traces leaked to clients).
  - Secrets/config management (`.env` + validated config module; no secrets in code).
- **Audit module (infrastructure only)**
  - `AuditEvent` entity + migration.
  - A generic `AuditService.logEvent(type, metadata, actorId)` that B and C's modules call directly — build and publish this early since it's a shared dependency.
- **Student/User module**
  - CRUD, bulk CSV import, college-ID mapping.
- **Config module**
  - Client/version config endpoint (used later by Electron in Phase 4, but the endpoint shape should exist now).

### Admin Portal (Next.js)
- Admin login page + auth context/provider (JWT storage, refresh handling, protected-route wrapper) — **this is shared infrastructure the other two will import**, so build it early.
- Student management screens: list, add, bulk import.

### Deliverable other two depend on
- `AuthGuard`, `@Roles()` decorator, `AuditService`, and the Next.js `<ProtectedRoute>`/auth-context — published by end of week 1 (can start as a working stub, e.g. `AuditService.logEvent()` just console-logs initially, real persistence follows).

---

## 4. Person B — Exam Content Domain

### Backend
- **Exam module**
  - CRUD, duration, start/end time, status state machine (`Draft → Scheduled → Active → Closed`), guarded by Person A's `@Roles('admin')`.
- **Question module**
  - CRUD, question types, marks, `Option` entity, bulk import (CSV/Excel).
- **ExamQuestion module**
  - Mapping questions to exams, ordering, randomization rules.
- **Student-assignment endpoints**
  - Assign/unassign students to an exam (logically part of exam configuration).
- Every mutating endpoint calls `AuditService.logEvent()` (Person A's contract) for create/update/status-change actions.

### Admin Portal
- Exam management screens: create/edit, schedule, start/stop.
- Question bank screens: manual entry + bulk import UI.
- Assign-students-to-exam screen.

### Independence notes
- Can build entirely against Person A's **stubbed** auth guard + audit service from Day 0; swaps in the real implementation with zero code changes once A publishes it (that's the point of agreeing the contract upfront).
- Owns its own entities/migrations (`Exam`, `Question`, `Option`, `ExamQuestion`) in separate migration files — no collision with A's or C's tables.

---

## 5. Person C — Attempt / Answer / Submission Domain + Monitoring

### Backend
- **Attempt module**
  - Eligibility checks (registered? exam active? not already attempted?), attempt creation, server-authoritative `expires_at`.
- **Answer module**
  - Save/update answers per attempt; question state enum (`NOT_VISITED`, `VISITED`, `ANSWERED`, `MARKED_REVIEW`, `ANSWERED_AND_MARKED_REVIEW`).
- **Submission module**
  - Validate attempt ownership + status, mark submitted, hook for auto-submit-on-expiry.
- **Timer service**
  - Pure, isolated server-side function: `isAttemptValid(now, expiresAt)`. Deliberately built as a standalone, dependency-free service — easy to unit test alone and a good place to start before Exam module (Person B) is finished, since it only needs an `expires_at` timestamp, not the full Exam entity.
- Emits audit events (`LOGIN`, `EXAM_STARTED`, `ANSWER_SAVED`, `SUBMITTED`, `AUTO_SUBMITTED`, `SECURITY_CHECK_FAILED`) via Person A's `AuditService`.

### Admin Portal
- Live monitoring screen: active attempts list + status.
- Audit event viewer (filter by exam/attempt/event type).
- Submissions list + result publishing screen.

### Independence notes
- Depends on Person B's `Exam`/`Question` entities existing (for foreign keys), but can develop against **mock Exam/Question fixtures** first and swap to real repositories once B's entities land — start with the Timer service and Attempt state machine in isolation, integrate the Exam FK last.
- Owns its own entities/migrations (`Attempt`, `Answer`, `ExamSession`, `Submission`, `Result`).

---

## 6. Dependency Map (who blocks whom)

```
Person A (Auth guard + AuditService contract)
        |
        v
   published as stub on Day 0-1
        |
   +----+----+
   |         |
   v         v
Person B   Person C
(Exam,     (Attempt, Answer,
 Question)  Submission, Timer)
   |             ^
   +----FK ref---+
   (Attempt -> Exam/Question,
    can be mocked until B ships)
```

- **Nobody is blocked past Day 1** because Person A ships a stub contract immediately; real implementations swap in later without changing B/C's code (this is the whole point of agreeing interfaces before writing logic).
- **Only real cross-dependency:** Person C's `Attempt`/`ExamQuestion` foreign keys need Person B's `Exam`/`Question` tables to exist before a true integration test can run — mitigated by mocking those repositories until B's migrations land (target: end of week 1).

---

## 7. How They Combine Cleanly

- **File-level separation:** each person's backend work lives in its own NestJS module folder (`src/modules/auth`, `src/modules/exam`, `src/modules/attempt`, etc.) and its own migration files — near-zero chance of merge conflicts inside a module.
- **Route-level separation in admin portal:** Next.js route folders map 1:1 to owners (`/login`, `/students` → A; `/exams`, `/questions` → B; `/monitoring`, `/audit`, `/results` → C) — same benefit.
- **Shared contract discipline:** any change to `packages/types` or `packages/validation` (the shared interfaces) requires a quick sync between all three before merging, since that's the one shared surface.
- **Integration cadence:** merge each module into a shared `develop` branch as soon as it passes its own unit tests; run a short daily (or every-other-day) integration check — spin up the full stack, hit each other's real endpoints instead of stubs, fix drift early rather than at the end.
- **Testing ownership:** each person writes unit tests for their own module; a lightweight end-to-end test (exam created → question added → student assigned → attempt started → answer saved → submitted) is a shared responsibility once all three modules exist, since it touches all of them.

---

## 8. Phase 1 Exit Checklist (combined)

- [ ] Admin can log in, create an exam, add questions, assign students, schedule it (A + B).
- [ ] Exam moves through Draft → Scheduled → Active → Closed correctly (B).
- [ ] A test attempt can be created, answered, and submitted purely via API calls (Postman/Swagger) — no exam UI needed yet (C).
- [ ] Server rejects an expired attempt and rejects a submission after the exam is closed (C).
- [ ] Every sensitive action (login, exam create/update, attempt start, answer save, submit) produces an audit event visible in the admin portal (A + C).
- [ ] Rate limiting blocks repeated failed logins; all admin/API routes require the correct role (A).
- [ ] All secrets are in environment config, not code; HTTPS/CORS/security headers are enforced (A).
- [ ] CI runs lint + unit tests for all three modules on every PR.
