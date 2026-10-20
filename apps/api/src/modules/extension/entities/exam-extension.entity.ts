/**
 * Owner: Person C (Time Extension, Dashboard)
 *
 * Audit trail of granted extra time. The effect itself lives on the rows it
 * changed (exams.end_time, attempts.expiresAt); a STUDENT extension granted
 * before that student starts is applied by AttemptService when they do.
 */

import { ExtensionScope } from '@secure-exam/types';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('exam_extensions')
@Index('IDX_exam_extensions_exam_student', ['examId', 'studentId'])
export class ExamExtensionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  examId: string;

  @Column({ type: 'enum', enum: ExtensionScope, enumName: 'extension_scope_enum' })
  scope: ExtensionScope;

  /** users.id of the student for STUDENT scope; null for ALL. */
  @Column({ type: 'uuid', nullable: true })
  studentId: string | null;

  @Column({ type: 'int' })
  minutes: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  /** users.id of the admin who granted it. */
  @Column({ type: 'uuid' })
  createdBy: string;

  /** Running attempts whose expiry was pushed at grant time. */
  @Column({ type: 'int', default: 0 })
  affectedAttempts: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
