import { MigrationInterface, QueryRunner } from 'typeorm';
import { backfillOwnership, convertAdminRoleToInstructor } from '../phase5-ownership';

/**
 * Owner: Person A (Phase 5). Instructors and TAs replace the admin role.
 *
 * - users.role: `admin` becomes `instructor`, and `ta` is added.
 * - course_staff: who teaches each course (instructors) and who assists (TAs,
 *   with per-course permissions).
 * - exams.course_id: the owning course. questions.owner_id / topics.owner_id:
 *   the instructor whose question bank they are in.
 *
 * Existing data is given owners (see backfillOwnership): every course gets the
 * former admins as instructors (or only MIGRATION_DEFAULT_INSTRUCTOR_EMAIL),
 * every exam its first assigned course (or a LEGACY course), and every
 * question and topic the default instructor.
 *
 * The role and backfill steps live in ../phase5-ownership.ts because the dev
 * seed runs them too (it builds the schema with synchronize, which can't turn
 * `admin` rows into `instructor` rows by itself), and because TypeORM treats
 * every export of a migration file as a migration.
 */
export class AInstructorsAndTeachingAssistants1794000000000 implements MigrationInterface {
  name = 'AInstructorsAndTeachingAssistants1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await convertAdminRoleToInstructor(queryRunner);

    await queryRunner.query(`CREATE TYPE "course_staff_role_enum" AS ENUM ('INSTRUCTOR', 'TA')`);
    await queryRunner.query(`
      CREATE TABLE "course_staff" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "courseId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "role" "course_staff_role_enum" NOT NULL,
        "permissions" jsonb NOT NULL DEFAULT '[]',
        "addedBy" uuid,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_course_staff" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_course_staff_course_user" UNIQUE ("courseId", "userId"),
        CONSTRAINT "FK_course_staff_course" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_course_staff_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_course_staff_courseId" ON "course_staff" ("courseId")`);
    await queryRunner.query(`CREATE INDEX "IDX_course_staff_userId" ON "course_staff" ("userId")`);

    await queryRunner.query(`ALTER TABLE "exams" ADD COLUMN "course_id" uuid`);
    await queryRunner.query(`CREATE INDEX "IDX_exams_course_id" ON "exams" ("course_id")`);
    await queryRunner.query(`ALTER TABLE "questions" ADD COLUMN "owner_id" uuid`);
    await queryRunner.query(`CREATE INDEX "IDX_questions_owner_id" ON "questions" ("owner_id")`);
    await queryRunner.query(`ALTER TABLE "topics" ADD COLUMN "owner_id" uuid`);
    await queryRunner.query(`CREATE INDEX "IDX_topics_owner_id" ON "topics" ("owner_id")`);

    await backfillOwnership(queryRunner, process.env.MIGRATION_DEFAULT_INSTRUCTOR_EMAIL);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_topics_owner_id"`);
    await queryRunner.query(`ALTER TABLE "topics" DROP COLUMN "owner_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_questions_owner_id"`);
    await queryRunner.query(`ALTER TABLE "questions" DROP COLUMN "owner_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_exams_course_id"`);
    await queryRunner.query(`ALTER TABLE "exams" DROP COLUMN "course_id"`);
    await queryRunner.query(`DROP TABLE "course_staff"`);
    await queryRunner.query(`DROP TYPE "course_staff_role_enum"`);

    // Instructors become admins again. A TA has no safe equivalent (admin would
    // see everything), so TAs are turned into inactive student accounts.
    await queryRunner.query(`UPDATE "users" SET "isActive" = false WHERE "role" = 'ta'`);
    await queryRunner.query(`ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_new"`);
    await queryRunner.query(`CREATE TYPE "users_role_enum" AS ENUM ('admin', 'student')`);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum"
      USING (CASE "role"::text WHEN 'instructor' THEN 'admin' WHEN 'ta' THEN 'student' ELSE "role"::text END)::"users_role_enum"
    `);
    await queryRunner.query(`DROP TYPE "users_role_enum_new"`);
  }
}
