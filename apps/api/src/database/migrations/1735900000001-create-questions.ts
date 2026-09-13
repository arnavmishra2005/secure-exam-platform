import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateQuestions1735900000001 implements MigrationInterface {
  name = 'CreateQuestions1735900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "questions_type_enum" AS ENUM ('MCQ_SINGLE','MCQ_MULTI','TRUE_FALSE')`);
    await queryRunner.query(`
      CREATE TABLE "questions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "text" text NOT NULL,
        "type" "questions_type_enum" NOT NULL,
        "marks" double precision NOT NULL,
        "negative_marks" double precision,
        "explanation" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_questions" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "questions"`);
    await queryRunner.query(`DROP TYPE "questions_type_enum"`);
  }
}
