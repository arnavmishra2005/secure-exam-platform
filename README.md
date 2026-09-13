# How to Run the Project

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

CORS_ORIGIN=http://localhost:3001

THROTTLE_TTL=60
THROTTLE_LIMIT=1000
```

### Admin Web (`apps/admin-web/.env`)
Copy from the example file if it does not already exist:
```bash
cp apps/admin-web/.env.example apps/admin-web/.env
```

Default configuration:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
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

#### Terminal 2 — Start Admin Web Portal:
```bash
npm run admin:dev
```
- **Admin Portal**: http://localhost:3001

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
