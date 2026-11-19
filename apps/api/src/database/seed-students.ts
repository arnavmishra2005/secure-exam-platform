/**
 * Loads the college's student list. Staff can't create students in the app:
 * every student account comes from here, and instructors enrol students in
 * their courses by searching this list by email or college ID. Students sign
 * in with the email and password given here.
 *
 *   npm run db:seed-students                   the demo college (40 students)
 *   npm run db:seed-students -- students.json  your own list:
 *     [{ "collegeId": "CS2025001", "fullName": "A Student", "email": "a@college.edu", "password": "at-least-8-chars" }]
 *
 * Idempotent: existing students are left as they are (passwords included);
 * run it again with a longer list to add the new ones. An email that belongs
 * to staff, or a college ID that belongs to another account, is skipped and
 * reported. In production a JSON file is required.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import cliDataSource from './data-source';
import { DEMO_STUDENT_PASSWORD, DEMO_STUDENTS, type SeedStudent, upsertStudents } from './seed-data/students';

async function main() {
  const file = process.argv[2];
  if (!file && process.env.NODE_ENV === 'production') {
    throw new Error('In production, pass a JSON file of students: the demo accounts have a known password.');
  }
  // npm runs workspace scripts in apps/api; INIT_CWD is where the command was typed.
  const path = file ? resolve(process.env.INIT_CWD ?? process.cwd(), file) : null;
  const students: SeedStudent[] = path ? JSON.parse(readFileSync(path, 'utf8')) : DEMO_STUDENTS;
  if (!Array.isArray(students) || students.length === 0) throw new Error('The file must hold a non-empty JSON array');

  const ds = new DataSource({
    ...(cliDataSource.options as PostgresConnectionOptions),
    migrations: [],
    synchronize: false,
  });
  await ds.initialize();
  try {
    const results = await upsertStudents(ds, students);
    for (const r of results) {
      const label = { created: '✅ Created', updated: '🔁 Updated', unchanged: '⏭  Exists ', skipped: '⚠️  Skipped' }[r.status];
      console.log(`${label}  ${r.collegeId.padEnd(12)} ${r.email}${r.reason ? ` (${r.reason})` : ''}`);
    }
    const created = results.filter((r) => r.status === 'created').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    console.log(`\n${created} created, ${results.length - created - skipped} already there, ${skipped} skipped.`);
    if (!file && created > 0) console.log(`Password for the demo students: ${DEMO_STUDENT_PASSWORD}`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
