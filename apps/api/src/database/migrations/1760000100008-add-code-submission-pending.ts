import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Person B. Depends on: code_submissions.
 * PENDING = saved, not run yet (deferred grading, or queued for regrading
 * after a question was edited). SUPERSEDED = replaced by a later Submit.
 */
export class AddCodeSubmissionPending1760000100008 implements MigrationInterface {
  name = 'AddCodeSubmissionPending1760000100008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "code_submissions_status_enum" ADD VALUE IF NOT EXISTS 'PENDING'`);
    await queryRunner.query(`ALTER TYPE "code_submissions_status_enum" ADD VALUE IF NOT EXISTS 'SUPERSEDED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres can't drop an enum value: rebuild the type. PENDING/SUPERSEDED rows become ERROR.
    await queryRunner.query(`UPDATE "code_submissions" SET "status" = 'ERROR' WHERE "status" IN ('PENDING', 'SUPERSEDED')`);
    await queryRunner.query(`ALTER TYPE "code_submissions_status_enum" RENAME TO "code_submissions_status_enum_old"`);
    await queryRunner.query(`CREATE TYPE "code_submissions_status_enum" AS ENUM ('GRADED','ERROR')`);
    await queryRunner.query(`
      ALTER TABLE "code_submissions" ALTER COLUMN "status" TYPE "code_submissions_status_enum"
        USING "status"::text::"code_submissions_status_enum"
    `);
    await queryRunner.query(`DROP TYPE "code_submissions_status_enum_old"`);
  }
}
