/**
 * Owner: Person A (Phase 5). Shared by the instructors migration
 * (1794000000000-A-InstructorsAndTeachingAssistants) and the dev seed.
 */

/** Anything that can run SQL: a QueryRunner, a DataSource or an EntityManager. */
interface Sql {
  // TypeORM's own query() returns Promise<any>; callers type each result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, parameters?: unknown[]): Promise<any>;
}

/**
 * Rebuilds users_role_enum as ('instructor', 'ta', 'student'), turning admins
 * into instructors. A new type is created rather than `ALTER TYPE … ADD VALUE`
 * because a value added that way can't be used in the same transaction.
 * Does nothing when the enum has no `admin` value (already converted, or new).
 */
export async function convertAdminRoleToInstructor(sql: Sql): Promise<boolean> {
  const legacy: unknown[] = await sql.query(
    `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'users_role_enum' AND e.enumlabel = 'admin'`,
  );
  if (legacy.length === 0) return false;

  await sql.query(`ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_old"`);
  await sql.query(`CREATE TYPE "users_role_enum" AS ENUM ('instructor', 'ta', 'student')`);
  await sql.query(`
    ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum"
    USING (CASE "role"::text WHEN 'admin' THEN 'instructor' ELSE "role"::text END)::"users_role_enum"
  `);
  await sql.query(`DROP TYPE "users_role_enum_old"`);
  return true;
}

/**
 * Gives owners to rows made before instructors existed. Only fills gaps, so it
 * is safe to run again. Does nothing when there is no instructor yet.
 *
 * - A course with no instructor gets every instructor, or only the one with
 *   `defaultInstructorEmail` when given.
 * - An exam with no course gets the first course assigned to it, else a
 *   LEGACY course taught by the default instructor.
 * - Questions and topics with no owner get the default instructor.
 */
export async function backfillOwnership(sql: Sql, defaultInstructorEmail?: string): Promise<void> {
  const instructors: { id: string; email: string }[] = await sql.query(
    `SELECT "id", "email" FROM "users" WHERE "role" = 'instructor' ORDER BY "createdAt", "id"`,
  );
  if (instructors.length === 0) return;
  const chosen = defaultInstructorEmail
    ? instructors.find((u) => u.email.toLowerCase() === defaultInstructorEmail.toLowerCase())
    : undefined;
  if (defaultInstructorEmail && !chosen) {
    throw new Error(`MIGRATION_DEFAULT_INSTRUCTOR_EMAIL=${defaultInstructorEmail} is not an instructor`);
  }
  const defaultInstructor = chosen ?? instructors[0];
  const courseInstructors = chosen ? [chosen] : instructors;

  // Courses with no instructor are found once, before any is added, so every
  // chosen instructor gets each of them.
  const orphanCourses: { id: string }[] = await sql.query(
    `SELECT c."id" FROM "courses" c
      WHERE NOT EXISTS (SELECT 1 FROM "course_staff" s WHERE s."courseId" = c."id" AND s."role" = 'INSTRUCTOR')`,
  );
  if (orphanCourses.length > 0) {
    for (const instructor of courseInstructors) {
      await sql.query(
        `INSERT INTO "course_staff" ("courseId", "userId", "role", "permissions")
         SELECT unnest($1::uuid[]), $2, 'INSTRUCTOR', '[]'::jsonb
         ON CONFLICT ("courseId", "userId") DO NOTHING`,
        [orphanCourses.map((c) => c.id), instructor.id],
      );
    }
  }

  await sql.query(`
    UPDATE "exams" e SET "course_id" = (
      SELECT ec."courseId" FROM "exam_courses" ec WHERE ec."examId" = e."id" ORDER BY ec."createdAt", ec."id" LIMIT 1
    )
    WHERE e."course_id" IS NULL AND EXISTS (SELECT 1 FROM "exam_courses" ec WHERE ec."examId" = e."id")
  `);
  const unplaced: { count: string }[] = await sql.query(`SELECT COUNT(*) AS count FROM "exams" WHERE "course_id" IS NULL`);
  if (Number(unplaced[0]?.count ?? 0) > 0) {
    const [legacy]: { id: string }[] = await sql.query(
      `INSERT INTO "courses" ("code", "name", "description")
       VALUES ('LEGACY', 'Exams from before courses', 'Created by the Phase 5 migration for exams that had no course.')
       ON CONFLICT ("code") DO UPDATE SET "code" = EXCLUDED."code"
       RETURNING "id"`,
    );
    await sql.query(
      `INSERT INTO "course_staff" ("courseId", "userId", "role", "permissions")
       VALUES ($1, $2, 'INSTRUCTOR', '[]'::jsonb)
       ON CONFLICT ("courseId", "userId") DO NOTHING`,
      [legacy.id, defaultInstructor.id],
    );
    await sql.query(`UPDATE "exams" SET "course_id" = $1 WHERE "course_id" IS NULL`, [legacy.id]);
  }

  await sql.query(`UPDATE "questions" SET "owner_id" = $1 WHERE "owner_id" IS NULL`, [defaultInstructor.id]);
  await sql.query(`UPDATE "topics" SET "owner_id" = $1 WHERE "owner_id" IS NULL`, [defaultInstructor.id]);
}
