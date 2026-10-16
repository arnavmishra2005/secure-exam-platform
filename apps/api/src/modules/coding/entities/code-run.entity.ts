import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CodeLanguage, CodeRunKind, ExecutionStatus } from '@secure-exam/types';

/**
 * One "Run" click during an attempt (custom stdin or sample tests). Kept as
 * an audit/debug trail; it never affects marks. Attempt and student are
 * other owners' tables, referenced by ID only.
 */
@Entity('code_runs')
@Index('IDX_code_runs_attempt_question', ['attemptId', 'questionId'])
export class CodeRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  /** users.id (JWT sub). */
  @Column({ name: 'student_id', type: 'uuid' })
  @Index()
  studentId: string;

  @Column({ type: 'enum', enum: CodeRunKind })
  kind: CodeRunKind;

  @Column({ type: 'varchar', length: 20 })
  language: CodeLanguage;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'text', nullable: true })
  stdin: string | null;

  /** Overall status; for SAMPLES runs, the first non-OK status (or OK). */
  @Column({ type: 'enum', enum: ExecutionStatus })
  status: ExecutionStatus;

  /** Capped output. For SAMPLES runs, a JSON summary of each sample. */
  @Column({ type: 'text', default: '' })
  stdout: string;

  @Column({ type: 'text', default: '' })
  stderr: string;

  @Column({ name: 'time_ms', type: 'int', nullable: true })
  timeMs: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
