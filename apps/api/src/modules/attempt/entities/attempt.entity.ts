import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AttemptStatus } from '@secure-exam/types';

/**
 * Owner: Person C.
 *
 * `examId` and `studentId` are plain UUID columns (foreign key BY ID ONLY).
 * We deliberately do NOT declare TypeORM `@ManyToOne` relations to Person
 * B's Exam/Question entities or Person A's Student/User entities — see
 * the file-structure doc's "loosely coupled modules" rule: "C's Attempt
 * entity references B's Exam/Question entities by ID only ... never by
 * importing B's service directly into C's service."
 *
 * Referential integrity is still enforced at the database level (see
 * database/migrations/*-CreateAttemptSession.ts), just not via TypeORM
 * relation decorators / joins in application code. Answers/Sessions are
 * looked up by plain `attemptId` queries rather than ORM relations too,
 * for the same reason and to avoid any circular-import risk between
 * entity files.
 */
@Entity('attempts')
@Unique('UQ_attempts_exam_student', ['examId', 'studentId'])
export class AttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_attempts_examId')
  examId: string;

  @Column({ type: 'uuid' })
  @Index('IDX_attempts_studentId')
  studentId: string;

  @Column({
    type: 'enum',
    enum: AttemptStatus,
    enumName: 'attempt_status_enum',
    default: AttemptStatus.IN_PROGRESS,
  })
  @Index('IDX_attempts_status')
  status: AttemptStatus;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  /** Server-authoritative expiry — never derived from client-supplied time. */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
