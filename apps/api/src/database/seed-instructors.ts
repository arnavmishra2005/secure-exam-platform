/**
 * Creates instructor accounts. There is no admin and no web page for this:
 * whoever runs the server creates instructors here, and instructors then
 * create their courses and choose their own TAs in the app.
 *
 *   npm run db:seed-instructors                      the development accounts
 *   npm run db:seed-instructors -- instructors.json  your own list:
 *     [{ "email": "a@college.edu", "fullName": "Dr. A", "password": "at-least-8-chars" }]
 *
 * Idempotent: existing instructors are left as they are (passwords included).
 * Needs the Phase 5 migrations (`npm run migration:run`), which add the
 * instructor role. In production a JSON file is required.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import cliDataSource from './data-source';
import { DEFAULT_INSTRUCTORS, type SeedInstructor, upsertInstructors } from './seed-data/instructors';

async function main() {
  const file = process.argv[2];
  if (!file && process.env.NODE_ENV === 'production') {
    throw new Error('In production, pass a JSON file of instructors: the built-in accounts have known passwords.');
  }
  // npm runs workspace scripts in apps/api; INIT_CWD is where the command was typed.
  const path = file ? resolve(process.env.INIT_CWD ?? process.cwd(), file) : null;
  const instructors: SeedInstructor[] = path ? JSON.parse(readFileSync(path, 'utf8')) : DEFAULT_INSTRUCTORS;
  if (!Array.isArray(instructors) || instructors.length === 0) throw new Error('The file must hold a non-empty JSON array');

  const ds = new DataSource({
    ...(cliDataSource.options as PostgresConnectionOptions),
    migrations: [],
    synchronize: false,
  });
  await ds.initialize();
  try {
    const [hasRole] = await ds.query(
      `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'users_role_enum' AND e.enumlabel = 'instructor'`,
    );
    if (!hasRole) throw new Error('The database has no instructor role yet. Run `npm run migration:run` (or `npm run db:seed` in development) first.');

    const results = await upsertInstructors(ds, instructors);
    for (const r of results) {
      const label = { created: '✅ Created', updated: '🔁 Updated', unchanged: '⏭  Exists ', skipped: '⚠️  Skipped' }[r.status];
      console.log(`${label}  ${r.email}${r.reason ? ` (${r.reason})` : ''}`);
    }
    if (!file && results.some((r) => r.status === 'created')) {
      console.log(`\nPassword for the new development accounts: ${DEFAULT_INSTRUCTORS[0].password}`);
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
