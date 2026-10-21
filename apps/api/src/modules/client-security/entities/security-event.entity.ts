/**
 * Owner: Person C (Electron, Kiosk & Security)
 *
 * One row per violation the exam app reports during an attempt. Refers to
 * the attempt, exam and student by id only (no relations), like the other
 * modules' entities.
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('security_events')
@Index('IDX_security_events_attempt', ['attemptId', 'occurredAt'])
@Index('IDX_security_events_exam', ['examId'])
export class SecurityEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  attemptId: string;

  @Column({ type: 'uuid' })
  examId: string;

  /** users.id of the student. */
  @Column({ type: 'uuid' })
  studentId: string;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  detail: string | null;

  /** Device clock when it happened: informational only. */
  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  /** Server clock when it was received. */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
