import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Owner: Person C. One row per finalized attempt (manual or auto). */
@Entity('submissions')
@Unique('UQ_submissions_attemptId', ['attemptId'])
export class SubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_submissions_attemptId')
  attemptId: string;

  @Column({ type: 'timestamptz' })
  submittedAt: Date;

  /** True when the server finalized this on expiry rather than a manual Submit click. */
  @Column({ type: 'boolean', default: false })
  isAutoSubmitted: boolean;

  @Column({ type: 'int' })
  totalQuestions: number;

  @Column({ type: 'int' })
  answeredCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
