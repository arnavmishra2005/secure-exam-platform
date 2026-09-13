import { MigrationInterface, QueryRunner } from 'typeorm';

/** Depends on: questions (FK question_id). Must run after create-questions. */
export class CreateOptions1735900000002 implements MigrationInterface {
  name = 'CreateOptions1735900000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "options" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "question_id" uuid NOT NULL,
        "text" text NOT NULL,
        "is_correct" boolean NOT NULL DEFAULT false,
        "order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_options" PRIMARY KEY ("id"),
        CONSTRAINT "FK_options_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_options_question_id" ON "options" ("question_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "options"`);
  }
}
