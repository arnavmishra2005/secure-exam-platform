import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Students are notified when staff open (start) a published exam:
 * notification_type_enum gains EXAM_OPENED. Postgres can't drop an enum value,
 * so down() leaves it in place.
 */
export class AExamOpenedNotification1794300000000 implements MigrationInterface {
  name = 'AExamOpenedNotification1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'EXAM_OPENED'`);
  }

  public async down(): Promise<void> {
    // Enum values can't be dropped; nothing else to undo.
  }
}
