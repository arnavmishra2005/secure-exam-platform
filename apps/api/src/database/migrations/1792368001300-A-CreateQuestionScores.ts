import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner: Person A (Phase 4). Per-question scores written through
 * ScoreRecorder. Existing finalized attempts have no rows here until
 * POST /results/exams/:examId/recompute is run for their exam.
 */
export class ACreateQuestionScores1792368001300 implements MigrationInterface {
  name = 'ACreateQuestionScores1792368001300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "score_source_enum" AS ENUM ('AUTO_MCQ', 'AUTO_CODE', 'MANUAL')`);
    await queryRunner.query(`
      CREATE TABLE "question_scores" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attemptId" uuid NOT NULL,
        "examId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "questionId" uuid NOT NULL,
        "source" "score_source_enum" NOT NULL,
        "score" double precision NOT NULL,
        "maxScore" double precision NOT NULL,
        "isCorrect" boolean,
        "details" jsonb,
        "gradedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_question_scores" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_question_scores_attempt_question" UNIQUE ("attemptId", "questionId"),
        CONSTRAINT "FK_question_scores_attempt" FOREIGN KEY ("attemptId") REFERENCES "attempts" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_question_scores_exam" FOREIGN KEY ("examId") REFERENCES "exams" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_question_scores_attemptId" ON "question_scores" ("attemptId")`);
    await queryRunner.query(`CREATE INDEX "IDX_question_scores_examId" ON "question_scores" ("examId")`);
    await queryRunner.query(`CREATE INDEX "IDX_question_scores_questionId" ON "question_scores" ("questionId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "question_scores"`);
    await queryRunner.query(`DROP TYPE "score_source_enum"`);
  }
}
