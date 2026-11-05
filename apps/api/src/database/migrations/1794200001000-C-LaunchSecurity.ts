import { MigrationInterface, QueryRunner } from 'typeorm';
export class CLaunchSecurity1794200001000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE exam_captchas (id uuid PRIMARY KEY, "answerHash" varchar(64) NOT NULL, "expiresAt" timestamptz NOT NULL)`);
    await q.query(`CREATE TABLE exam_refresh_sessions (id uuid PRIMARY KEY, "userId" uuid NOT NULL, "examId" uuid NOT NULL, "tokenHash" varchar NOT NULL, "expiresAt" timestamptz NOT NULL)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE exam_refresh_sessions');
    await q.query('DROP TABLE exam_captchas');
  }
}
