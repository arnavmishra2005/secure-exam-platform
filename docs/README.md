# How to Run the Project

> **Phase 4:** `apps/web` is the new single app for admins and students (one
> sign-in, role-based landing). `apps/admin-web` and `apps/exam-client` still
> run but are legacy until the Day 7 merge. What changed and the shared
> contracts are in [docs/phase4-contracts.md](docs/phase4-contracts.md).
> The Electron exam app, its kiosk decisions and open follow-ups are in
> [docs/kiosk-integration.md](docs/kiosk-integration.md).

## Prerequisites

- **Node.js**: v18 or v20+
- **Docker & Docker Compose**: for PostgreSQL

---

## 1. Environment Configuration

Ensure `.env` files are configured for both the API backend and the Admin Web portal.

### Backend (`apps/api/.env`)
Copy from the example file if it does not already exist:
```bash
cp apps/api/.env.example apps/api/.env
```

Default configuration:
```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgres://exam_user:exam_pass@localhost:5432/secure_exam

JWT_ACCESS_SECRET=change-me-access-secret-change-me
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=change-me-refresh-secret-change-me
JWT_REFRESH_EXPIRES_IN=7d

CORS_ORIGIN=http://localhost:3001,http://localhost:3002,http://localhost:3003

THROTTLE_TTL=60
THROTTLE_LIMIT=1000

HEARTBEAT_DISCONNECT_SECONDS=45
```

`CORS_ORIGIN` must include `http://localhost:3003` for the new web app.

### Web app (`apps/web/.env`)
Copy from the example file if it does not already exist:
```bash
cp apps/web/.env.example apps/web/.env
```

Default configuration:
```env
VITE_API_BASE_URL=http://localhost:3000
VITE_HEARTBEAT_INTERVAL_MS=15000
```

### Admin Web — legacy (`apps/admin-web/.env`)
Copy from the example file if it does not already exist:
```bash
cp apps/admin-web/.env.example apps/admin-web/.env
```

Default configuration:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Exam Client — legacy (`apps/exam-client/renderer/.env`)
Copy from the example file if it does not already exist:
```bash
cp apps/exam-client/renderer/.env.example apps/exam-client/renderer/.env
```

Default configuration:
```env
VITE_API_BASE_URL=http://localhost:3000
```

---

## 2. Install Dependencies

Install all dependencies across the monorepo:
```bash
npm install
```

---

## 3. Start PostgreSQL Database

Start the PostgreSQL container:
```bash
docker compose up -d postgres
```

Verify that the container is healthy:
```bash
docker compose ps
```

---

## 4. Run Database Migrations

Apply all migrations to initialize the database schema:
```bash
npm run migration:run
```

Run migrations before starting the API: in development TypeORM's `synchronize` creates new tables, but only the migrations copy Phase 1 exam assignments into exam registrations. Without them, students can't start exams (registration is now required).

Optionally, seed development data: an admin (`admin@secure-exam.dev` / `Admin@1234`), three students (`alice@`, `bob@`, `carol@secure-exam.dev` / `Student@1234`), a course `CS201` they are enrolled in, and an active, published exam, ID `11111111-1111-4111-8111-111111111111`, with five questions, registered to that course. The seed is idempotent; re-running it also moves the exam's time window forward. Never run it in production.
```bash
npm run db:seed
```

---

## 5. Run the Application

### Option A: Local Development (Recommended)

Run the backend API and frontend admin portal in separate terminal windows:

#### Terminal 1 — Start Backend API:
```bash
npm run api:start
```
- **API Server**: http://localhost:3000
- **Swagger Documentation**: http://localhost:3000/api/docs

#### Terminal 2 — Start the web app (admins and students):
```bash
npm run web:dev
```
- **Web app**: http://localhost:3003 — sign in as the admin or a student; each lands on their own home.

#### Optional — legacy Admin Web Portal:
```bash
npm run admin:dev
```
- **Admin Portal**: http://localhost:3001

#### Optional — legacy Exam Client UI:
```bash
npm run client:dev
```
- **Exam Client Portal**: http://localhost:3002

---

### Option B: Docker Compose (All Services)

To run PostgreSQL, the API backend, and the Admin Web portal all inside Docker containers:
```bash
docker compose up --build
```

---

## 6. Verification & Build Commands

- **Run Backend Unit Tests**:
  ```bash
  npm run api:test
  ```
- **Run Web App Tests** (persistence, sync, server clock, routing smoke test):
  ```bash
  npm run web:test
  ```
- **Typecheck / Build the Web App**:
  ```bash
  npm run web:typecheck
  npm run web:build
  ```
- **Run Legacy Exam Client Tests**:
  ```bash
  npm run client:test
  ```
- **Typecheck Packages**:
  ```bash
  npm run typecheck
  ```
- **Build Backend API**:
  ```bash
  npm run api:build
  ```
- **Build Admin Web Portal**:
  ```bash
  npm run admin:build
  ```
- **Build Exam Client UI**:
  ```bash
  npm run client:build
  ```
