import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner: Person A (Phase 5). Rescheduling a published exam, and exams with no
 * pass mark.
 *
 * - original_start_time: set the first time a published exam is moved, so the
 *   student dashboard can show "Rescheduled" with the old time.
 * - schedule_note: the instructor's note about the latest reschedule.
 * - pass_mark_enabled: false = no pass/fail and no pass rate for the exam.
 * - notification_type_enum gains EXAM_RESCHEDULED (Postgres can't drop an
 *   enum value, so down() leaves it in place; nothing else uses it).
 */
export class AExamScheduleAndPassMark1794000001000 implements MigrationInterface {
  name = 'AExamScheduleAndPassMark1794000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "exams" ADD COLUMN "original_start_time" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "exams" ADD COLUMN "schedule_note" text`);
    await queryRunner.query(`ALTER TABLE "exams" ADD COLUMN "pass_mark_enabled" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'EXAM_RESCHEDULED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "exams" DROP COLUMN "pass_mark_enabled"`);
    await queryRunner.query(`ALTER TABLE "exams" DROP COLUMN "schedule_note"`);
    await queryRunner.query(`ALTER TABLE "exams" DROP COLUMN "original_start_time"`);
  }
}
