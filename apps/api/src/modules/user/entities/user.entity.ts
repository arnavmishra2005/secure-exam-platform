// Owner: Person A (Identity/Auth/Security)

import { Role } from '@secure-exam/types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentEntity } from './student.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  fullName!: string;

  // bcrypt hash only — never store or return the plaintext password.
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: Role })
  role!: Role;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  // hash of the current refresh token, so a stolen/rotated token can be
  // revoked server-side. Never store the raw refresh token.
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  refreshTokenHash!: string | null;

  @OneToOne(() => StudentEntity, (student) => student.user)
  student?: StudentEntity;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
