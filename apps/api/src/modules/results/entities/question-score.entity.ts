// Owner: Person A (Platform, Courses, Publish, Results)

import { ScoreSource } from '@secure-exam/types';
import { Column, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * One graded question of one attempt. Written only through ScoreRecorder.
 * `studentId` is the users.id, matching attempts.studentId.
 */
@Entity('question_scores')
@Unique('UQ_question_scores_attempt_question', ['attemptId', 'questionId'])
export class QuestionScoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_question_scores_attemptId')
  @Column({ type: 'uuid' })
  attemptId!: string;

  @Index('IDX_question_scores_examId')
  @Column({ type: 'uuid' })
  examId!: string;

  @Column({ type: 'uuid' })
  studentId!: string;

  @Index('IDX_question_scores_questionId')
  @Column({ type: 'uuid' })
  questionId!: string;

  @Column({ type: 'enum', enum: ScoreSource, enumName: 'score_source_enum' })
  source!: ScoreSource;

  @Column({ type: 'double precision' })
  score!: number;

  @Column({ type: 'double precision' })
  maxScore!: number;

  @Column({ type: 'boolean', nullable: true })
  isCorrect!: boolean | null;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  gradedAt!: Date;
}
