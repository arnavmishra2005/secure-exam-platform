import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Person B. attempt_id and student_id point at other owners' tables
 * (attempts, users) by ID only, so there are no FKs to them.
 */
export class CreateCodeSubmissions1760000100006 implements MigrationInterface {
  name = 'CreateCodeSubmissions1760000100006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "code_submissions_status_enum" AS ENUM ('GRADED','ERROR')`);
    await queryRunner.query(`
      CREATE TABLE "code_submissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attempt_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "language" character varying(20) NOT NULL,
        "code" text NOT NULL,
        "status" "code_submissions_status_enum" NOT NULL,
        "passed" integer NOT NULL DEFAULT 0,
        "total" integer NOT NULL DEFAULT 0,
        "score" double precision NOT NULL DEFAULT 0,
        "max_score" double precision NOT NULL DEFAULT 0,
        "results_json" jsonb NOT NULL DEFAULT '[]',
        "is_final" boolean NOT NULL DEFAULT false,
        "from_draft" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_code_submissions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_code_submissions_attempt_question" ON "code_submissions" ("attempt_id", "question_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_code_submissions_student_id" ON "code_submissions" ("student_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "code_submissions"`);
    await queryRunner.query(`DROP TYPE "code_submissions_status_enum"`);
  }
}
