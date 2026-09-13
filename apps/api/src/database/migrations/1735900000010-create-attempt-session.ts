import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttemptSession1735900000010 implements MigrationInterface {
  name = 'CreateAttemptSession1735900000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "attempt_status_enum" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED');
    `);

    await queryRunner.query(`
      CREATE TABLE "attempts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "examId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "status" "attempt_status_enum" NOT NULL DEFAULT 'IN_PROGRESS',
        "startedAt" TIMESTAMPTZ NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "submittedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attempts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_attempts_exam_student" UNIQUE ("examId", "studentId")
      );
    `);

    await queryRunner.query(`CREATE INDEX "IDX_attempts_examId" ON "attempts" ("examId");`);
    await queryRunner.query(`CREATE INDEX "IDX_attempts_studentId" ON "attempts" ("studentId");`);
    await queryRunner.query(`CREATE INDEX "IDX_attempts_status" ON "attempts" ("status");`);

    await queryRunner.query(`
      ALTER TABLE "attempts"
      ADD CONSTRAINT "FK_attempts_exam" FOREIGN KEY ("examId") REFERENCES "exams" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
    `);

    // NOTE: Uncomment once Person A's students/users table migration exists:
    // await queryRunner.query(`
    //   ALTER TABLE "attempts"
    //   ADD CONSTRAINT "FK_attempts_student" FOREIGN KEY ("studentId") REFERENCES "students" ("id")
    //   ON DELETE RESTRICT ON UPDATE CASCADE;
    // `);

    await queryRunner.query(`
      CREATE TABLE "exam_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attemptId" uuid NOT NULL,
        "ipAddress" varchar(45),
        "userAgent" text,
        "startedAt" TIMESTAMPTZ NOT NULL,
        "lastSeenAt" TIMESTAMPTZ NOT NULL,
        "endedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exam_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_exam_sessions_attempt" FOREIGN KEY ("attemptId") REFERENCES "attempts" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`CREATE INDEX "IDX_exam_sessions_attemptId" ON "exam_sessions" ("attemptId");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_sessions";`);
    await queryRunner.query(`ALTER TABLE "attempts" DROP CONSTRAINT IF EXISTS "FK_attempts_student";`);
    await queryRunner.query(`ALTER TABLE "attempts" DROP CONSTRAINT IF EXISTS "FK_attempts_exam";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attempts";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "attempt_status_enum";`);
  }
}
