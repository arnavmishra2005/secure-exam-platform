// Owner: Person A (Identity/Auth/Security)
// Validates process.env at boot so a missing/malformed secret fails fast
// instead of surfacing as a confusing runtime error later.

import * as Joi from 'joi';
import { labNetworkAllows } from '../guards/lab-network';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  CORS_ORIGIN: Joi.string().required(),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(0),
  EXAM_ALLOWED_CIDRS: Joi.string().allow('').custom((value) => { labNetworkAllows('127.0.0.1', value); return value; }),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(1000),

  // Person B: sandboxed code runner (modules/execution)
  RUNNER_DOCKER_BIN: Joi.string().default('docker'),
  RUNNER_PYTHON_IMAGE: Joi.string().default('python:3.12-slim'),
  // #16: C/C++ (gcc + g++) and Java images, built from infra/runner-images (`npm run runner:images`).
  RUNNER_GCC_IMAGE: Joi.string().default('secure-exam/runner-gcc:1'),
  RUNNER_JAVA_IMAGE: Joi.string().default('secure-exam/runner-java:21'),
  // C/C++/Java only under gVisor (RUNNER_DOCKER_RUNTIME). Unset = required in production only.
  RUNNER_REQUIRE_GVISOR_FOR_COMPILED: Joi.boolean(),
  RUNNER_MAX_CONCURRENCY: Joi.number().integer().min(1).default(4),
  RUNNER_MAX_QUEUE: Joi.number().integer().min(0).default(100),
  RUNNER_RUNS_PER_MINUTE: Joi.number().integer().min(1).default(20),
  RUNNER_OUTPUT_LIMIT_BYTES: Joi.number().integer().min(1024).default(65536),
  RUNNER_STARTUP_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
  // #19 sandbox hardening (docs/execution-security.md). Docker runtime for sandboxes, e.g. `runsc` (gVisor).
  RUNNER_DOCKER_RUNTIME: Joi.string().allow('').optional(),
  // seccomp profile path (relative to apps/api), or `docker-default` for Docker's own, weaker profile.
  RUNNER_SECCOMP_PROFILE: Joi.string().default('../../infra/runner/seccomp.json'),
  // Runs of one attempt stopped by limits before it is flagged as suspicious on Monitoring.
  RUNNER_FLAG_LIMIT_BATCHES: Joi.number().integer().min(1).default(3),
  // Person B: execution modes — see "Decision log" in person_b_plan.md.
  // DEFERRED: Submit only saves; grading runs after the attempt ends. LIVE: Submit grades immediately.
  CODING_GRADING_MODE: Joi.string().valid('DEFERRED', 'LIVE').default('DEFERRED'),
  // Whether Run / Run samples may execute on the server. Unset = on in development, off in production.
  CODING_SERVER_RUN: Joi.boolean(),

  // Person C — monitoring: seconds without a heartbeat before an attempt shows as disconnected.
  HEARTBEAT_DISCONNECT_SECONDS: Joi.number().integer().min(10).default(45),


  // Email notifications (SMTP_*) — deferred; in-app notifications only for now.
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional(),

  // Person C — desktop client (DESKTOP_*). Optional until the Electron app lands.
  DESKTOP_MIN_CLIENT_VERSION: Joi.string().optional(),
  // Development only: let instructors and TAs sign in from the exam app (X-Client-Type: DESKTOP).
  ALLOW_STAFF_ON_DESKTOP: Joi.boolean().default(false),
  // Phase 5 migration: the instructor who gets existing courses/exams/questions (default: all former admins).
  MIGRATION_DEFAULT_INSTRUCTOR_EMAIL: Joi.string().email().optional(),
  // Exams (start, questions, answers, submit) only from the exam app. Set false to use a browser in development.
  REQUIRE_DESKTOP_CLIENT: Joi.boolean().default(true),
  // Violations at which an attempt shows as flagged on the monitoring screen.
  VIOLATION_FLAG_THRESHOLD: Joi.number().integer().min(1).default(5),
  // How long a one-time exam launch token (browser -> exam app) stays valid.
  EXAM_LAUNCH_TTL_SECONDS: Joi.number().integer().min(30).max(600).default(120),
});
