// Owner: Person A (Identity/Auth/Security)

import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateUserStudent1725000000000 implements MigrationInterface {
  name = 'CreateUserStudent1725000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "users_role_enum" AS ENUM ('admin', 'student')`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'email', type: 'varchar', length: '255', isUnique: true },
          { name: 'fullName', type: 'varchar', length: '255' },
          { name: 'passwordHash', type: 'varchar', length: '255' },
          { name: 'role', type: 'users_role_enum' },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'refreshTokenHash', type: 'varchar', length: '255', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'students',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'userId', type: 'uuid', isUnique: true },
          { name: 'collegeId', type: 'varchar', length: '100', isUnique: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'students',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('students', true);
    await queryRunner.dropTable('users', true);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
