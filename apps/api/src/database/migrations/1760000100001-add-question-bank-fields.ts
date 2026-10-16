import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Person B. Depends on: questions, topics.
 * Adds the CODING question type and the bank fields (course, topic,
 * difficulty, status). Existing questions become READY.
 */
export class AddQuestionBankFields1760000100001 implements MigrationInterface {
  name = 'AddQuestionBankFields1760000100001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "questions_type_enum" ADD VALUE IF NOT EXISTS 'CODING'`);
    await queryRunner.query(`CREATE TYPE "questions_difficulty_enum" AS ENUM ('EASY','MEDIUM','HARD')`);
    await queryRunner.query(`CREATE TYPE "questions_status_enum" AS ENUM ('DRAFT','READY','ARCHIVED')`);
    await queryRunner.query(`
      ALTER TABLE "questions"
        ADD COLUMN "course_id" uuid,
        ADD COLUMN "topic_id" uuid,
        ADD COLUMN "difficulty" "questions_difficulty_enum",
        ADD COLUMN "status" "questions_status_enum" NOT NULL DEFAULT 'READY',
        ADD CONSTRAINT "FK_questions_topic" FOREIGN KEY ("topic_id")
          REFERENCES "topics"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_questions_course_id" ON "questions" ("course_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_questions_topic_id" ON "questions" ("topic_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_questions_topic_id"`);
    await queryRunner.query(`DROP INDEX "IDX_questions_course_id"`);
    await queryRunner.query(`
      ALTER TABLE "questions"
        DROP CONSTRAINT "FK_questions_topic",
        DROP COLUMN "status",
        DROP COLUMN "difficulty",
        DROP COLUMN "topic_id",
        DROP COLUMN "course_id"
    `);
    await queryRunner.query(`DROP TYPE "questions_status_enum"`);
    await queryRunner.query(`DROP TYPE "questions_difficulty_enum"`);
    // Postgres can't drop an enum value: rebuild the type without CODING.
    // Fails if CODING questions still exist, which is the safe outcome.
    await queryRunner.query(`ALTER TYPE "questions_type_enum" RENAME TO "questions_type_enum_old"`);
    await queryRunner.query(`CREATE TYPE "questions_type_enum" AS ENUM ('MCQ_SINGLE','MCQ_MULTI','TRUE_FALSE')`);
    await queryRunner.query(`
      ALTER TABLE "questions" ALTER COLUMN "type" TYPE "questions_type_enum"
        USING "type"::text::"questions_type_enum"
    `);
    await queryRunner.query(`DROP TYPE "questions_type_enum_old"`);
  }
}
