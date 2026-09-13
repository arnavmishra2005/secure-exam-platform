import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Depends on: exams (this repo) AND Person A's users/students table.
 *
 * ASSUMPTION (must be confirmed with Person A before merging — flagged
 * explicitly in the source doc, section "30. Database migrations" and
 * "6. Important database design"): the student/user table is named
 * "users" with a uuid primary key "id". If A's table has a different name
 * or a different PK type, update the FK below (and ExamAssignmentEntity's
 * column type) accordingly.
 *
 * For solo/local development before A's table exists, either:
 *   (a) comment out the FK_exam_assignments_student constraint below, or
 *   (b) run this against a scratch DB that has a placeholder `users` table:
 *         CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
 */
export class CreateExamAssignments1735900000004 implements MigrationInterface {
  name = 'CreateExamAssignments1735900000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "exam_assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "exam_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exam_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_exam_student" UNIQUE ("exam_id", "student_id"),
        CONSTRAINT "FK_exam_assignments_exam" FOREIGN KEY ("exam_id")
          REFERENCES "exams"("id") ON DELETE CASCADE
        -- , CONSTRAINT "FK_exam_assignments_student" FOREIGN KEY ("student_id")
        --     REFERENCES "users"("id") ON DELETE CASCADE
        -- ^ uncomment once Person A's users table migration has run in the
        --   shared environment; keep commented for standalone Person-B dev.
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_exam_assignments_exam_id" ON "exam_assignments" ("exam_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_exam_assignments_student_id" ON "exam_assignments" ("student_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "exam_assignments"`);
  }
}
