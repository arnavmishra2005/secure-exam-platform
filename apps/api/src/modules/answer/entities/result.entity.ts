import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Owner: Person C. One row per finalized attempt, published by an admin. */
@Entity('results')
@Unique('UQ_results_attemptId', ['attemptId'])
export class ResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_results_attemptId')
  attemptId: string;

  /** Person B's Exam.id — referenced by ID only. */
  @Column({ type: 'uuid' })
  @Index('IDX_results_examId')
  examId: string;

  /** Person A's Student.id — referenced by ID only. */
  @Column({ type: 'uuid' })
  @Index('IDX_results_studentId')
  studentId: string;

  @Column({ type: 'double precision', default: 0 })
  score: number;

  @Column({ type: 'double precision', default: 0 })
  maxScore: number;

  /** True when every question in the exam could be auto-graded. */
  @Column({ type: 'boolean', default: false })
  autoGraded: boolean;

  /** True when at least one subjective question still needs a human grader. */
  @Column({ type: 'boolean', default: false })
  needsManualReview: boolean;

  @Column({ type: 'boolean', default: false })
  published: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
