import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The exam timer stops while a student moves to another device with the
 * invigilator's approval (not after leaving through Ctrl+Alt+Delete).
 * attempts.timerPausedAt: when the student left off; null while running.
 */
export class CDeviceChangeTimerPause1794300000001 implements MigrationInterface {
  name = 'CDeviceChangeTimerPause1794300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "timerPausedAt" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attempts" DROP COLUMN IF EXISTS "timerPausedAt"`);
  }
}
