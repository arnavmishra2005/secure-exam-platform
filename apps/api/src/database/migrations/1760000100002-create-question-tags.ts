import { MigrationInterface, QueryRunner } from 'typeorm';

/** Person B. Depends on: questions. */
export class CreateQuestionTags1760000100002 implements MigrationInterface {
  name = 'CreateQuestionTags1760000100002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "question_tags" (
        "question_id" uuid NOT NULL,
        "tag" character varying(50) NOT NULL,
        CONSTRAINT "PK_question_tags" PRIMARY KEY ("question_id", "tag"),
        CONSTRAINT "FK_question_tags_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_question_tags_tag" ON "question_tags" ("tag")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "question_tags"`);
  }
}
