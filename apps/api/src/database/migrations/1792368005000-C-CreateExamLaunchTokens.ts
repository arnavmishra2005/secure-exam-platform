import { MigrationInterface, QueryRunner } from 'typeorm';

/** Owner: Person C. One-time tokens for opening an exam in the exam app. */
export class CCreateExamLaunchTokens1792368005000 implements MigrationInterface {
  name = 'CCreateExamLaunchTokens1792368005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "exam_launch_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tokenHash" character varying(64) NOT NULL,
        "userId" uuid NOT NULL,
        "examId" uuid NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "usedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exam_launch_tokens" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_exam_launch_tokens_hash" ON "exam_launch_tokens" ("tokenHash")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_exam_launch_tokens_hash"`);
    await queryRunner.query(`DROP TABLE "exam_launch_tokens"`);
  }
}
