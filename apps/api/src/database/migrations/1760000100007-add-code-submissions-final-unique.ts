import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Person B. Depends on: code_submissions. At most one final (counted)
 * submission per attempt + question, so a code score is recorded once.
 */
export class AddCodeSubmissionsFinalUnique1760000100007 implements MigrationInterface {
  name = 'AddCodeSubmissionsFinalUnique1760000100007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_code_submissions_final" ON "code_submissions" ("attempt_id", "question_id") WHERE "is_final" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_code_submissions_final"`);
  }
}
