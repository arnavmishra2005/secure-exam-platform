import { MigrationInterface, QueryRunner } from 'typeorm';

/** Person B. Depends on: questions. */
export class CreateCodingTestCases1760000100004 implements MigrationInterface {
  name = 'CreateCodingTestCases1760000100004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "coding_test_cases" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "question_id" uuid NOT NULL,
        "input" text NOT NULL DEFAULT '',
        "expected_output" text NOT NULL,
        "is_sample" boolean NOT NULL DEFAULT false,
        "weight" integer NOT NULL DEFAULT 1,
        "order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_coding_test_cases" PRIMARY KEY ("id"),
        CONSTRAINT "FK_coding_test_cases_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_coding_test_cases_question_id" ON "coding_test_cases" ("question_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "coding_test_cases"`);
  }
}
