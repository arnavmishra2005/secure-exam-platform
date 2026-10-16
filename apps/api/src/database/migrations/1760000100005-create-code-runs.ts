import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Person B. attempt_id and student_id point at other owners' tables
 * (attempts, users) by ID only, so there are no FKs to them.
 */
export class CreateCodeRuns1760000100005 implements MigrationInterface {
  name = 'CreateCodeRuns1760000100005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "code_runs_kind_enum" AS ENUM ('CUSTOM','SAMPLES')`);
    await queryRunner.query(`
      CREATE TYPE "code_runs_status_enum" AS ENUM (
        'OK','RUNTIME_ERROR','TIME_LIMIT_EXCEEDED','MEMORY_LIMIT_EXCEEDED',
        'OUTPUT_LIMIT_EXCEEDED','INTERNAL_ERROR'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "code_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attempt_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "kind" "code_runs_kind_enum" NOT NULL,
        "language" character varying(20) NOT NULL,
        "code" text NOT NULL,
        "stdin" text,
        "status" "code_runs_status_enum" NOT NULL,
        "stdout" text NOT NULL DEFAULT '',
        "stderr" text NOT NULL DEFAULT '',
        "time_ms" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_code_runs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_code_runs_attempt_question" ON "code_runs" ("attempt_id", "question_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_code_runs_student_id" ON "code_runs" ("student_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "code_runs"`);
    await queryRunner.query(`DROP TYPE "code_runs_status_enum"`);
    await queryRunner.query(`DROP TYPE "code_runs_kind_enum"`);
  }
}
