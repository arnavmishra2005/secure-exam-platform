import { MigrationInterface, QueryRunner } from 'typeorm';

/** Owner: Person C. Violations reported by the exam app during an attempt. */
export class CCreateSecurityEvents1792368004000 implements MigrationInterface {
  name = 'CCreateSecurityEvents1792368004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "security_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attemptId" uuid NOT NULL,
        "examId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "type" character varying(40) NOT NULL,
        "detail" character varying(300),
        "occurredAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_security_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_security_events_attempt" ON "security_events" ("attemptId", "occurredAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_security_events_exam" ON "security_events" ("examId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_security_events_exam"`);
    await queryRunner.query(`DROP INDEX "IDX_security_events_attempt"`);
    await queryRunner.query(`DROP TABLE "security_events"`);
  }
}
