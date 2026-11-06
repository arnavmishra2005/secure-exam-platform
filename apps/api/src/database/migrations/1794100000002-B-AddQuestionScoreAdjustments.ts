import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner: Person B (#13), on Person A's `question_scores` table (additive
 * columns only; see docs/merge-notes-person-b.md). A manual adjustment is
 * stored next to the automatic score, so re-grading changes `autoScore` and
 * the adjustment survives: score = clamp(autoScore + manualAdjustment, 0, maxScore).
 */
export class BAddQuestionScoreAdjustments1794100000002 implements MigrationInterface {
  name = 'BAddQuestionScoreAdjustments1794100000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "question_scores"
        ADD COLUMN IF NOT EXISTS "autoScore" double precision,
        ADD COLUMN IF NOT EXISTS "manualAdjustment" double precision NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "adjustedBy" uuid,
        ADD COLUMN IF NOT EXISTS "adjustedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "adjustReason" varchar(500)
    `);
    await queryRunner.query(`UPDATE "question_scores" SET "autoScore" = "score" WHERE "autoScore" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "question_scores"
        DROP COLUMN IF EXISTS "adjustReason",
        DROP COLUMN IF EXISTS "adjustedAt",
        DROP COLUMN IF EXISTS "adjustedBy",
        DROP COLUMN IF EXISTS "manualAdjustment",
        DROP COLUMN IF EXISTS "autoScore"
    `);
  }
}
