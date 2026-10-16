import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Person B. Bank topics. `course_id` is Person A's courses.id, referenced by
 * ID only (no FK) so this runs independently of A's migrations.
 */
export class CreateTopics1760000100000 implements MigrationInterface {
  name = 'CreateTopics1760000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "topics" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_id" uuid,
        "name" character varying(100) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_topics" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_topics_course_name" UNIQUE ("course_id", "name")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_topics_course_id" ON "topics" ("course_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "topics"`);
  }
}
