import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner: Person C (Phase 4). Time extensions. Runs after Person A's
 * (…1xxx) and Person B's (…2xxx) Phase 4 migrations.
 */
export class CCreateExamExtensions1792368003000 implements MigrationInterface {
  name = 'CCreateExamExtensions1792368003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "extension_scope_enum" AS ENUM ('ALL', 'STUDENT')`);
    await queryRunner.query(`
      CREATE TABLE "exam_extensions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "examId" uuid NOT NULL,
        "scope" "extension_scope_enum" NOT NULL,
        "studentId" uuid,
        "minutes" integer NOT NULL,
        "reason" varchar(500),
        "createdBy" uuid NOT NULL,
        "affectedAttempts" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exam_extensions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_exam_extensions_minutes" CHECK ("minutes" > 0),
        CONSTRAINT "CHK_exam_extensions_scope_student" CHECK (("scope" = 'STUDENT') = ("studentId" IS NOT NULL)),
        CONSTRAINT "FK_exam_extensions_exam" FOREIGN KEY ("examId") REFERENCES "exams" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_exam_extensions_student" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_exam_extensions_exam_student" ON "exam_extensions" ("examId", "studentId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "exam_extensions"`);
    await queryRunner.query(`DROP TYPE "extension_scope_enum"`);
  }
}
