/**
 * Instructor accounts. Nobody in the app can create an instructor (there is no
 * admin), so they come from here: the dev seed uses the defaults below, and
 * `npm run db:seed-instructors` creates them, or the ones in a JSON file.
 */

import * as bcrypt from 'bcrypt';

export interface SeedInstructor {
  email: string;
  fullName: string;
  password: string;
}

/** Development accounts. The first one owns the sample course and exam. */
export const DEFAULT_INSTRUCTORS: SeedInstructor[] = [
  { email: 'instructor@secure-exam.dev', fullName: 'Dr. Meera Iyer', password: 'Instructor@1234' },
  { email: 'instructor2@secure-exam.dev', fullName: 'Dr. Arjun Rao', password: 'Instructor@1234' },
  { email: 'instructor3@secure-exam.dev', fullName: 'Prof. Sana Khan', password: 'Instructor@1234' },
];

const BCRYPT_ROUNDS = 10;

interface Sql {
  // TypeORM's own query() returns Promise<any>; callers type each result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, parameters?: unknown[]): Promise<any>;
}

export interface UpsertedInstructor {
  email: string;
  id: string;
  status: 'created' | 'updated' | 'unchanged' | 'skipped';
  reason?: string;
}

/**
 * Creates the instructors that don't exist yet. An existing instructor keeps
 * their password unless `resetPasswords` (the dev seed resets them so the
 * printed credentials always work). An email that belongs to a student or TA
 * is skipped: their role is never changed here.
 */
export async function upsertInstructors(
  sql: Sql,
  instructors: SeedInstructor[],
  options: { resetPasswords?: boolean } = {},
): Promise<UpsertedInstructor[]> {
  const results: UpsertedInstructor[] = [];
  for (const instructor of instructors) {
    validate(instructor);
    const [existing]: { id: string; role: string }[] = await sql.query(
      `SELECT "id", "role" FROM "users" WHERE LOWER("email") = LOWER($1) LIMIT 1`,
      [instructor.email],
    );
    if (existing && existing.role !== 'instructor') {
      results.push({
        email: instructor.email,
        id: existing.id,
        status: 'skipped',
        reason: `already a ${existing.role} account`,
      });
      continue;
    }
    if (existing) {
      if (options.resetPasswords) {
        await sql.query(`UPDATE "users" SET "passwordHash" = $1, "isActive" = true WHERE "id" = $2`, [
          await bcrypt.hash(instructor.password, BCRYPT_ROUNDS),
          existing.id,
        ]);
      }
      results.push({ email: instructor.email, id: existing.id, status: options.resetPasswords ? 'updated' : 'unchanged' });
      continue;
    }
    const [row]: { id: string }[] = await sql.query(
      `INSERT INTO "users" ("email", "fullName", "passwordHash", "role", "isActive")
       VALUES ($1, $2, $3, 'instructor', true) RETURNING "id"`,
      [instructor.email.trim(), instructor.fullName.trim(), await bcrypt.hash(instructor.password, BCRYPT_ROUNDS)],
    );
    results.push({ email: instructor.email, id: row.id, status: 'created' });
  }
  return results;
}

function validate(instructor: SeedInstructor): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(instructor.email ?? '')) {
    throw new Error(`Not an email address: ${instructor.email}`);
  }
  if (!instructor.fullName?.trim()) throw new Error(`${instructor.email}: fullName is required`);
  if ((instructor.password ?? '').length < 8) {
    throw new Error(`${instructor.email}: the password must be at least 8 characters`);
  }
}
