import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner: Person A (Phase 4). Exam publishing.
 *
 * Phase 1 had no publish step: any SCHEDULED/ACTIVE/CLOSED exam was already
 * reachable by its students. Those are back-filled as published so exams
 * running during the upgrade keep working; DRAFT exams start unpublished.
 */
export class AAddExamPublishFields1792368001100 implements MigrationInterface {
  name = 'AAddExamPublishFields1792368001100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "exams" ADD COLUMN "published_at" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "exams" ADD COLUMN "pass_percentage" integer NOT NULL DEFAULT 40`);
    await queryRunner.query(
      `ALTER TABLE "exams" ADD CONSTRAINT "CHK_exams_pass_percentage" CHECK ("pass_percentage" BETWEEN 0 AND 100)`,
    );
    await queryRunner.query(`UPDATE "exams" SET "published_at" = "updated_at" WHERE "status" <> 'DRAFT'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "exams" DROP CONSTRAINT IF EXISTS "CHK_exams_pass_percentage"`);
    await queryRunner.query(`ALTER TABLE "exams" DROP COLUMN "pass_percentage"`);
    await queryRunner.query(`ALTER TABLE "exams" DROP COLUMN "published_at"`);
  }
}
