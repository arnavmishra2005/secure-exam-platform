import { MigrationInterface, QueryRunner } from 'typeorm';

/** Person B. Depends on: questions. One row per CODING question. */
export class CreateCodingProblems1760000100003 implements MigrationInterface {
  name = 'CreateCodingProblems1760000100003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "coding_problems_comparison_mode_enum" AS ENUM ('EXACT','TRIM','TOKENS')`,
    );
    await queryRunner.query(`
      CREATE TABLE "coding_problems" (
        "question_id" uuid NOT NULL,
        "statement_md" text NOT NULL,
        "starter_code" jsonb NOT NULL DEFAULT '{}',
        "allowed_languages" text array NOT NULL DEFAULT '{python}',
        "time_limit_ms" integer NOT NULL DEFAULT 2000,
        "memory_limit_mb" integer NOT NULL DEFAULT 256,
        "comparison_mode" "coding_problems_comparison_mode_enum" NOT NULL DEFAULT 'TRIM',
        "reference_solution" text,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coding_problems" PRIMARY KEY ("question_id"),
        CONSTRAINT "FK_coding_problems_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "coding_problems"`);
    await queryRunner.query(`DROP TYPE "coding_problems_comparison_mode_enum"`);
  }
}
