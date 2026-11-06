import { MigrationInterface, QueryRunner } from 'typeorm';

export class CPhase5ExamContinuity1794200000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE exams ADD COLUMN grade_unsubmitted_code boolean NOT NULL DEFAULT true`);
    await q.query(`ALTER TABLE exams ALTER COLUMN grade_unsubmitted_code SET DEFAULT false`);
    await q.query(`ALTER TABLE answers ADD COLUMN marked_for_review boolean NOT NULL DEFAULT false`);
    await q.query(`UPDATE answers SET marked_for_review = state IN ('MARKED_REVIEW', 'ANSWERED_AND_MARKED_REVIEW')`);
    await q.query(`ALTER TABLE attempts ADD COLUMN "lastQuestionId" uuid, ADD COLUMN "activeSessionId" uuid,
      ADD COLUMN "deviceChangeRequestedAt" timestamptz, ADD COLUMN "deviceChangeTokenHash" varchar,
      ADD COLUMN "deviceChangeApprovedAt" timestamptz`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE attempts DROP COLUMN "deviceChangeApprovedAt", DROP COLUMN "deviceChangeTokenHash",
      DROP COLUMN "deviceChangeRequestedAt", DROP COLUMN "activeSessionId", DROP COLUMN "lastQuestionId"`);
    await q.query(`ALTER TABLE answers DROP COLUMN marked_for_review`);
    await q.query(`ALTER TABLE exams DROP COLUMN grade_unsubmitted_code`);
  }
}
