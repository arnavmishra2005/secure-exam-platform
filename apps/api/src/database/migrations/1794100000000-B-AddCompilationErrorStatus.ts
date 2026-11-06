import { MigrationInterface, QueryRunner } from 'typeorm';

/** Owner: Person B (Phase 5 #8). A run that fails to compile is recorded as COMPILATION_ERROR. */
export class BAddCompilationErrorStatus1794100000000 implements MigrationInterface {
  name = 'BAddCompilationErrorStatus1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "code_runs_status_enum" ADD VALUE IF NOT EXISTS 'COMPILATION_ERROR' BEFORE 'RUNTIME_ERROR'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres can't drop an enum value, so rebuild the type without it.
    await queryRunner.query(`UPDATE "code_runs" SET "status" = 'RUNTIME_ERROR' WHERE "status" = 'COMPILATION_ERROR'`);
    await queryRunner.query(`ALTER TYPE "code_runs_status_enum" RENAME TO "code_runs_status_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "code_runs_status_enum" AS ENUM ('OK','RUNTIME_ERROR','TIME_LIMIT_EXCEEDED','MEMORY_LIMIT_EXCEEDED','OUTPUT_LIMIT_EXCEEDED','INTERNAL_ERROR')`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_runs" ALTER COLUMN "status" TYPE "code_runs_status_enum" USING "status"::text::"code_runs_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "code_runs_status_enum_old"`);
  }
}
