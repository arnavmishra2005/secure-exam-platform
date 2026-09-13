import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner: Person B
 * ASSUMPTION: no dependency on other people's tables, so this can run first
 * among B's migrations. Run order across the whole team should follow
 * dependency order, not per-person grouping (see doc: "order migrations by
 * dependency, not by person").
 */
export class CreateExams1735900000000 implements MigrationInterface {
  name = 'CreateExams1735900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE TYPE "exams_status_enum" AS ENUM ('DRAFT','SCHEDULED','ACTIVE','CLOSED')`);
    await queryRunner.query(`
      CREATE TABLE "exams" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying NOT NULL,
        "description" character varying,
        "duration_minutes" integer NOT NULL,
        "start_time" TIMESTAMPTZ NOT NULL,
        "end_time" TIMESTAMPTZ NOT NULL,
        "status" "exams_status_enum" NOT NULL DEFAULT 'DRAFT',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exams" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "exams"`);
    await queryRunner.query(`DROP TYPE "exams_status_enum"`);
  }
}
