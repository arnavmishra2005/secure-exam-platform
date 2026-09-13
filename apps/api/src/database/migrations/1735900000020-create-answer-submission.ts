import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnswerSubmission1735900000020 implements MigrationInterface {
  name = 'CreateAnswerSubmission1735900000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "question_state_enum" AS ENUM (
        'NOT_VISITED', 'VISITED', 'ANSWERED', 'MARKED_REVIEW', 'ANSWERED_AND_MARKED_REVIEW'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "answers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attemptId" uuid NOT NULL,
        "questionId" uuid NOT NULL,
        "selectedOptionIds" jsonb,
        "textResponse" text,
        "state" "question_state_enum" NOT NULL DEFAULT 'NOT_VISITED',
        "answeredAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_answers_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_answers_attempt_question" UNIQUE ("attemptId", "questionId"),
        CONSTRAINT "FK_answers_attempt" FOREIGN KEY ("attemptId") REFERENCES "attempts" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`CREATE INDEX "IDX_answers_attemptId" ON "answers" ("attemptId");`);
    await queryRunner.query(`CREATE INDEX "IDX_answers_questionId" ON "answers" ("questionId");`);

    await queryRunner.query(`
      ALTER TABLE "answers"
      ADD CONSTRAINT "FK_answers_question" FOREIGN KEY ("questionId") REFERENCES "questions" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      CREATE TABLE "submissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attemptId" uuid NOT NULL,
        "submittedAt" TIMESTAMPTZ NOT NULL,
        "isAutoSubmitted" boolean NOT NULL DEFAULT false,
        "totalQuestions" integer NOT NULL,
        "answeredCount" integer NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_submissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_submissions_attemptId" UNIQUE ("attemptId"),
        CONSTRAINT "FK_submissions_attempt" FOREIGN KEY ("attemptId") REFERENCES "attempts" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "results" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attemptId" uuid NOT NULL,
        "examId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "score" double precision NOT NULL DEFAULT 0,
        "maxScore" double precision NOT NULL DEFAULT 0,
        "autoGraded" boolean NOT NULL DEFAULT false,
        "needsManualReview" boolean NOT NULL DEFAULT false,
        "published" boolean NOT NULL DEFAULT false,
        "publishedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_results_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_results_attemptId" UNIQUE ("attemptId"),
        CONSTRAINT "FK_results_attempt" FOREIGN KEY ("attemptId") REFERENCES "attempts" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "results"
      ADD CONSTRAINT "FK_results_exam" FOREIGN KEY ("examId") REFERENCES "exams" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
    `);

    // NOTE: Uncomment once Person A's students/users table migration exists:
    // await queryRunner.query(`
    //   ALTER TABLE "results"
    //   ADD CONSTRAINT "FK_results_student" FOREIGN KEY ("studentId") REFERENCES "students" ("id")
    //   ON DELETE RESTRICT ON UPDATE CASCADE;
    // `);

    await queryRunner.query(`CREATE INDEX "IDX_results_examId" ON "results" ("examId");`);
    await queryRunner.query(`CREATE INDEX "IDX_results_studentId" ON "results" ("studentId");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "results";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "submissions";`);
    await queryRunner.query(`ALTER TABLE "answers" DROP CONSTRAINT IF EXISTS "FK_answers_question";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "answers";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "question_state_enum";`);
  }
}
