# Phase 1 — File Structure, Ownership & Integration Map

Legend: **[A]** Person A (Identity/Auth/Security) · **[B]** Person B (Exam Content) · **[C]** Person C (Attempt/Answer/Monitoring) · **[SHARED]** touched by all, agreed together

> Note on ORM choice: entities are modeled as **one TypeORM entity class per file, inside each domain module** (not one giant shared schema file) — this is a deliberate choice so three people editing the schema never touch the same file.

---

## 1. Root Monorepo Layout

```
secure-exam/
├── apps/
│   ├── api/                  → NestJS backend
│   └── admin-web/             → Next.js admin portal
├── packages/
│   ├── types/                 → shared TS interfaces  [SHARED]
│   ├── validation/            → shared DTO schemas     [SHARED]
│   └── api-client/            → typed HTTP client       [SHARED]
├── database/
│   └── migrations/            → one file per table, owner = module owner
├── docker-compose.yml          → local Postgres + API + admin-web  [SHARED]
├── .github/workflows/ci.yml    → lint/build/test on PR  [SHARED]
└── docs/
```

Tech stack recap: **NestJS + TypeScript** (API), **TypeORM + PostgreSQL** (data layer), **Next.js + React + TypeScript** (admin portal), **class-validator/zod** (validation), **Passport + JWT** (auth), **Docker Compose** (local dev).

---

## 2. `packages/types` — Shared Interfaces [SHARED]

One file per entity, so each owner edits only their own file even though the package is shared.

```
packages/types/src/
├── index.ts                  [SHARED]  — re-exports everything below
├── user.types.ts             [A]       — User, Student, Role enum
├── auth.types.ts             [A]       — LoginRequest, LoginResponse, JwtPayload
├── exam.types.ts             [B]       — Exam, ExamStatus enum
├── question.types.ts         [B]       — Question, Option, QuestionType enum, ExamQuestion
├── attempt.types.ts          [C]       — Attempt, AttemptStatus, QuestionState enum
├── answer.types.ts           [C]       — Answer, Submission, Result
└── audit.types.ts            [A]       — AuditEvent, AuditEventType enum
```
**Content:** plain TypeScript `interface`/`enum` declarations only — no logic. Example (`exam.types.ts`):
```ts
export enum ExamStatus { DRAFT, SCHEDULED, ACTIVE, CLOSED }
export interface Exam { id: string; title: string; durationMinutes: number; startTime: string; endTime: string; status: ExamStatus; }
```
**Rule to avoid conflicts:** never edit `index.ts`'s export list and a `.types.ts` file in the same PR as someone else — index.ts changes should be small, additive one-liners.

---

## 3. `packages/validation` — Shared DTO Schemas [SHARED]

```
packages/validation/src/
├── index.ts                  [SHARED]
├── auth.schema.ts            [A]  — LoginDto validation (zod or class-validator)
├── user.schema.ts            [A]  — CreateStudentDto, BulkImportStudentsDto
├── exam.schema.ts            [B]  — CreateExamDto, UpdateExamDto
├── question.schema.ts        [B]  — CreateQuestionDto, BulkImportQuestionsDto
├── attempt.schema.ts         [C]  — StartAttemptDto
└── answer.schema.ts          [C]  — SaveAnswerDto, SubmitAttemptDto
```
**Tech:** `class-validator` + `class-transformer` (pairs naturally with NestJS pipes), or `zod` if the team prefers schema-first — decide once in Day 0, don't mix both.

---

## 4. `packages/api-client` — Typed HTTP Client [SHARED, generated where possible]

```
packages/api-client/src/
├── client.ts                 [A]  — base axios/fetch instance, auth token interceptor
├── auth.api.ts                [A]
├── exam.api.ts                 [B]
├── question.api.ts             [B]
├── attempt.api.ts               [C]
└── audit.api.ts                 [C]
```
**Content:** thin wrapper functions (`login()`, `createExam()`, `startAttempt()`...) typed against `packages/types`. Used by the admin portal so nobody hand-writes fetch calls. If NestJS Swagger is set up, this can later be auto-generated — for Phase 1, hand-written is fine.

---

## 5. `apps/api` (NestJS) — Full Structure

```
apps/api/src/
├── main.ts                              [A]  — bootstrap, Helmet, CORS, global pipes
├── app.module.ts                        [SHARED, small additive edits only]
│
├── common/                              [A]  — cross-cutting, everyone imports from here
│   ├── guards/
│   │   ├── jwt-auth.guard.ts            [A]
│   │   └── roles.guard.ts               [A]
│   ├── decorators/
│   │   └── roles.decorator.ts           [A]
│   ├── filters/
│   │   └── http-exception.filter.ts     [A]
│   ├── interceptors/
│   │   └── audit-logging.interceptor.ts [A]  — optional auto-logging hook
│   └── config/
│       └── config.module.ts             [A]  — env validation, secrets loading
│
├── modules/
│   ├── auth/                            [A]
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts           — POST /auth/login, /auth/refresh, /auth/logout
│   │   ├── auth.service.ts              — token issuance, bcrypt check
│   │   └── jwt.strategy.ts              — Passport JWT strategy
│   │
│   ├── user/                            [A]
│   │   ├── user.module.ts
│   │   ├── user.controller.ts           — CRUD + bulk import students
│   │   ├── user.service.ts
│   │   └── entities/
│   │       ├── user.entity.ts
│   │       └── student.entity.ts
│   │
│   ├── audit/                           [A]
│   │   ├── audit.module.ts
│   │   ├── audit.service.ts             — logEvent() — imported by B & C
│   │   ├── audit.controller.ts          — GET /audit?examId=&attemptId=
│   │   └── entities/audit-event.entity.ts
│   │
│   ├── exam/                            [B]
│   │   ├── exam.module.ts
│   │   ├── exam.controller.ts           — CRUD, schedule, start/stop, assign students
│   │   ├── exam.service.ts              — status state machine
│   │   └── entities/exam.entity.ts
│   │
│   ├── question/                        [B]
│   │   ├── question.module.ts
│   │   ├── question.controller.ts       — CRUD, bulk import
│   │   ├── question.service.ts
│   │   └── entities/
│   │       ├── question.entity.ts
│   │       ├── option.entity.ts
│   │       └── exam-question.entity.ts
│   │
│   ├── attempt/                         [C]
│   │   ├── attempt.module.ts
│   │   ├── attempt.controller.ts        — POST /attempts (start), GET /attempts/:id
│   │   ├── attempt.service.ts           — eligibility checks, expires_at calc
│   │   ├── timer.service.ts             — pure isAttemptValid(now, expiresAt)
│   │   └── entities/
│   │       ├── attempt.entity.ts
│   │       └── exam-session.entity.ts
│   │
│   └── answer/                          [C]
│       ├── answer.module.ts
│       ├── answer.controller.ts         — PUT /attempts/:id/answers/:qid
│       ├── submission.controller.ts     — POST /attempts/:id/submit
│       ├── answer.service.ts
│       ├── submission.service.ts
│       └── entities/
│           ├── answer.entity.ts
│           ├── submission.entity.ts
│           └── result.entity.ts
│
└── database/
    └── migrations/
        ├── xxxx-create-user-student.ts        [A]
        ├── xxxx-create-audit-event.ts         [A]
        ├── xxxx-create-exam.ts                [B]
        ├── xxxx-create-question-option.ts     [B]
        ├── xxxx-create-attempt-session.ts     [C]
        └── xxxx-create-answer-submission.ts   [C]
```

**Tech stack per layer:**
- Controllers/Services/Modules → **NestJS** (`@Controller`, `@Injectable`, `@Module`).
- Entities → **TypeORM** decorators (`@Entity`, `@Column`, `@ManyToOne`).
- DTO validation → **class-validator** decorators or **zod**, from `packages/validation`.
- Auth → **Passport-JWT**, **bcrypt**.
- Security middleware → **Helmet**, **@nestjs/throttler**, **@nestjs/config**.
- Migrations → **TypeORM CLI** migration files, timestamped filenames (naturally conflict-free).

---

## 6. `apps/admin-web` (Next.js) — Full Structure

```
apps/admin-web/src/
├── app/
│   ├── layout.tsx                       [SHARED, minimal]
│   ├── login/page.tsx                    [A]
│   ├── (protected)/
│   │   ├── layout.tsx                    [A]  — wraps children in <ProtectedRoute>
│   │   ├── students/page.tsx             [A]  — list/add/import students
│   │   ├── exams/
│   │   │   ├── page.tsx                  [B]  — exam list
│   │   │   ├── [examId]/page.tsx         [B]  — edit/schedule/start-stop
│   │   │   └── [examId]/assign/page.tsx  [B]  — assign students
│   │   ├── questions/
│   │   │   ├── page.tsx                  [B]  — question bank list
│   │   │   └── import/page.tsx           [B]  — bulk import UI
│   │   ├── monitoring/page.tsx           [C]  — live attempts list/status
│   │   ├── audit/page.tsx                [C]  — audit event viewer
│   │   └── results/page.tsx              [C]  — submissions + publish results
│
├── contexts/
│   └── auth-context.tsx                 [A]  — JWT storage, refresh, useAuth()
├── components/
│   ├── ui/                               [SHARED — scaffold together Day 0, e.g. shadcn/ui]
│   ├── ProtectedRoute.tsx                [A]
│   ├── exam/*                            [B]
│   ├── question/*                        [B]
│   ├── monitoring/*                      [C]
│   └── audit/*                           [C]
└── lib/
    └── api.ts                           [SHARED, thin re-export of packages/api-client]
```

**Tech stack:** **Next.js (App Router) + React + TypeScript**, **Tailwind CSS** (or shadcn/ui component kit scaffolded once on Day 0), **React Query or SWR** for data fetching/caching against `packages/api-client`.

---

## 7. What Needs to Be True for Everything to Connect

| Connection point | What ensures it works |
|---|---|
| **Shared types stay in sync** | `packages/types` is the single source of truth for entity shapes; both API and admin-web import from it — no duplicate interface definitions anywhere. |
| **API contract agreement** | Enable NestJS **Swagger** (`@nestjs/swagger`) from Day 0 — every controller decorated with `@ApiTags`/`@ApiResponse`. This is the fastest way for B and C to see A's real auth endpoints (and vice versa) without reading code. |
| **Auth works across all modules** | Every protected controller uses the **same** `JwtAuthGuard` + `@Roles()` decorator from `common/guards` — nobody writes their own auth check. |
| **Audit logging is consistent** | B and C call `AuditService.logEvent(type, metadata, actorId)` — same signature everywhere — instead of writing ad-hoc `console.log` or custom log tables. |
| **Database stays coherent** | All migrations run against the **same** Postgres instance (via `docker-compose.yml`); foreign keys (e.g. `Attempt.examId → Exam.id`) are only added once the referenced table's migration exists — order migrations by dependency, not by person. |
| **Environment/config consistency** | One `.env.example` at repo root, validated by `common/config/config.module.ts` — everyone runs against the same variable names (`DATABASE_URL`, `JWT_SECRET`, `PORT`, etc.). |
| **CORS/network** | Admin-web's origin is whitelisted once in A's CORS config — B and C don't need to touch this to call their own endpoints from the browser. |
| **Local dev parity** | `docker-compose.yml` spins up Postgres + API + admin-web together so any of the three can run the **full stack** locally, not just their own slice — catches integration bugs before PR. |
| **Merge discipline** | Each person's PRs touch only their module folder + (rarely) a one-line addition to `app.module.ts` or `packages/types/index.ts` — reviewed by whoever else touched that shared file most recently. |
| **Cross-module dependencies resolved safely** | C's `Attempt` entity references B's `Exam`/`Question` entities by **ID only** (foreign key column), never by importing B's service directly into C's service — keeps modules loosely coupled; if B's Exam module isn't ready yet, C can point the FK at a temporary seeded/mock exam row. |
| **End-to-end sanity check** | A shared integration test (owned jointly): create exam (B) → add question (B) → assign student (B) → login (A) → start attempt (C) → save answer (C) → submit (C) → audit trail visible (A+C). Run this after every few merges, not just at the end. |
