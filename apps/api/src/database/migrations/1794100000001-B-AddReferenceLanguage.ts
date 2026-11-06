import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner: Person B (#16). The language of a coding problem's reference
 * solution. C, C++ and Java need no other schema change: languages are
 * stored as text (`allowed_languages text[]`, `code_runs.language` and
 * `code_submissions.language` varchar).
 */
export class BAddReferenceLanguage1794100000001 implements MigrationInterface {
  name = 'BAddReferenceLanguage1794100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "coding_problems" ADD COLUMN IF NOT EXISTS "reference_language" varchar(20) NOT NULL DEFAULT 'python'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "coding_problems" DROP COLUMN IF EXISTS "reference_language"`);
  }
}
