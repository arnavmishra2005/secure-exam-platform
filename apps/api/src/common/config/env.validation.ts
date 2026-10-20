// Owner: Person A (Identity/Auth/Security)
// Validates process.env at boot so a missing/malformed secret fails fast
// instead of surfacing as a confusing runtime error later.

import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  CORS_ORIGIN: Joi.string().required(),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(1000),

  // Person B: sandboxed code runner (modules/execution)
  RUNNER_DOCKER_BIN: Joi.string().default('docker'),
  RUNNER_PYTHON_IMAGE: Joi.string().default('python:3.12-slim'),
  RUNNER_MAX_CONCURRENCY: Joi.number().integer().min(1).default(4),
  RUNNER_MAX_QUEUE: Joi.number().integer().min(0).default(100),
  RUNNER_RUNS_PER_MINUTE: Joi.number().integer().min(1).default(20),
  RUNNER_OUTPUT_LIMIT_BYTES: Joi.number().integer().min(1024).default(65536),
  RUNNER_STARTUP_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
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
});
