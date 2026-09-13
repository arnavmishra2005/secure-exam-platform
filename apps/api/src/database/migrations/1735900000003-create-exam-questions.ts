import { MigrationInterface, QueryRunner } from 'typeorm';

/** Depends on: exams, questions. Must run after both create-exams and create-questions. */
export class CreateExamQuestions1735900000003 implements MigrationInterface {
  name = 'CreateExamQuestions1735900000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "exam_questions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "exam_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_exam_questions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_exam_question" UNIQUE ("exam_id", "question_id"),
        CONSTRAINT "FK_exam_questions_exam" FOREIGN KEY ("exam_id")
          REFERENCES "exams"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_exam_questions_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_exam_questions_exam_id" ON "exam_questions" ("exam_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_exam_questions_question_id" ON "exam_questions" ("question_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "exam_questions"`);
  }
}
