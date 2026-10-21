/**
 * Owner: Person C (Electron, Kiosk & Security)
 *
 * A one-time token that lets a signed-in student open one exam in the exam
 * app without typing a password. Only the SHA-256 hash is stored, so a
 * database leak does not hand out working tokens.
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('exam_launch_tokens')
@Index('UQ_exam_launch_tokens_hash', ['tokenHash'], { unique: true })
export class ExamLaunchTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Hex SHA-256 of the token. */
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  /** users.id of the student who asked for it. */
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  examId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Set when it is redeemed; a token works once. */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
