// Owner: Person A (Identity/Auth/Security)
// Updated: changed type column from enum to varchar(128) to support all
// audit event strings from Person B and C modules without enum migrations.
// Also added examId and attemptId columns for richer filtering.

import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAuditEvent1725000000001 implements MigrationInterface {
  name = 'CreateAuditEvent1725000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_events',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'type', type: 'varchar', length: '128', isNullable: true },
          { name: 'actorId', type: 'uuid', isNullable: true },
          { name: 'metadata', type: 'jsonb', default: "'{}'" },
          { name: 'ipAddress', type: 'varchar', length: '64', isNullable: true },
          { name: 'examId', type: 'uuid', isNullable: true },
          { name: 'attemptId', type: 'uuid', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'audit_events',
      new TableIndex({ name: 'IDX_audit_events_type', columnNames: ['type'] }),
    );
    await queryRunner.createIndex(
      'audit_events',
      new TableIndex({ name: 'IDX_audit_events_actorId', columnNames: ['actorId'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_events', true);
  }
}
