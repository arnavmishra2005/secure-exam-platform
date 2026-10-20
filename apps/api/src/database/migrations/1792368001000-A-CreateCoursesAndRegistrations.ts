import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner: Person A (Phase 4). Courses, enrollment, and exam registrations.
 *
 * exam_registrations replaces exam_assignments. Existing assignments are
 * copied across as MANUAL registrations; Phase 1 could store either a
 * students.id or a users.id in exam_assignments.student_id, so both are
 * resolved to the students.id. Rows matching no student are dropped (they
 * could never have been used to start an attempt by a real student).
 */
export class ACreateCoursesAndRegistrations1792368001000 implements MigrationInterface {
  name = 'ACreateCoursesAndRegistrations1792368001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "courses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" varchar(32) NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_courses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_courses_code" ON "courses" ("code")`);

    await queryRunner.query(`
      CREATE TABLE "course_enrollments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "courseId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "enrolledAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_course_enrollments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_course_enrollments_course_student" UNIQUE ("courseId", "studentId"),
        CONSTRAINT "FK_course_enrollments_course" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_course_enrollments_student" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_course_enrollments_courseId" ON "course_enrollments" ("courseId")`);
    await queryRunner.query(`CREATE INDEX "IDX_course_enrollments_studentId" ON "course_enrollments" ("studentId")`);

    await queryRunner.query(`
      CREATE TABLE "exam_courses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "examId" uuid NOT NULL,
        "courseId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exam_courses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_exam_courses_exam_course" UNIQUE ("examId", "courseId"),
        CONSTRAINT "FK_exam_courses_exam" FOREIGN KEY ("examId") REFERENCES "exams" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_exam_courses_course" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_exam_courses_examId" ON "exam_courses" ("examId")`);
    await queryRunner.query(`CREATE INDEX "IDX_exam_courses_courseId" ON "exam_courses" ("courseId")`);

    await queryRunner.query(`CREATE TYPE "registration_source_enum" AS ENUM ('COURSE', 'MANUAL')`);
    await queryRunner.query(`
      CREATE TABLE "exam_registrations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "examId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "source" "registration_source_enum" NOT NULL DEFAULT 'MANUAL',
        "courseId" uuid,
        "registeredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exam_registrations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_exam_registrations_exam_student" UNIQUE ("examId", "studentId"),
        CONSTRAINT "FK_exam_registrations_exam" FOREIGN KEY ("examId") REFERENCES "exams" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_exam_registrations_student" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_exam_registrations_course" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_exam_registrations_examId" ON "exam_registrations" ("examId")`);
    await queryRunner.query(`CREATE INDEX "IDX_exam_registrations_studentId" ON "exam_registrations" ("studentId")`);

    if (await queryRunner.hasTable('exam_assignments')) {
      await queryRunner.query(`
        INSERT INTO "exam_registrations" ("examId", "studentId", "source", "registeredAt")
        SELECT DISTINCT ON (a."exam_id", s."id") a."exam_id", s."id", 'MANUAL', a."assigned_at"
          FROM "exam_assignments" a
          JOIN "students" s ON s."id" = a."student_id" OR s."userId" = a."student_id"
         ORDER BY a."exam_id", s."id", a."assigned_at"
        ON CONFLICT DO NOTHING
      `);
      await queryRunner.query(`DROP TABLE "exam_assignments"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "exam_assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "exam_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exam_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_exam_student" UNIQUE ("exam_id", "student_id"),
        CONSTRAINT "FK_exam_assignments_exam" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_exam_assignments_exam_id" ON "exam_assignments" ("exam_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_exam_assignments_student_id" ON "exam_assignments" ("student_id")`);
    // Course-derived registrations become plain assignments: Phase 1 had no other way to express them.
    await queryRunner.query(`
      INSERT INTO "exam_assignments" ("exam_id", "student_id", "assigned_at")
      SELECT "examId", "studentId", "registeredAt" FROM "exam_registrations"
    `);

    await queryRunner.query(`DROP TABLE "exam_registrations"`);
    await queryRunner.query(`DROP TYPE "registration_source_enum"`);
    await queryRunner.query(`DROP TABLE "exam_courses"`);
    await queryRunner.query(`DROP TABLE "course_enrollments"`);
    await queryRunner.query(`DROP TABLE "courses"`);
  }
}
