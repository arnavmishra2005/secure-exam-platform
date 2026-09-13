import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionState } from '@secure-exam/types';

/**
 * Owner: Person C. `attemptId`/`questionId` are plain UUID columns — see
 * the note in attempt.entity.ts on why no TypeORM relations are declared.
 */
@Entity('answers')
@Unique('UQ_answers_attempt_question', ['attemptId', 'questionId'])
export class AnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_answers_attemptId')
  attemptId: string;

  /** Person B's Question.id — referenced by ID only. */
  @Column({ type: 'uuid' })
  @Index('IDX_answers_questionId')
  questionId: string;

  /** Present for objective (single/multiple choice) questions. */
  @Column({ type: 'jsonb', nullable: true })
  selectedOptionIds: string[] | null;

  /** Present for descriptive/free-text questions. */
  @Column({ type: 'text', nullable: true })
  textResponse: string | null;

  @Column({
    type: 'enum',
    enum: QuestionState,
    enumName: 'question_state_enum',
    default: QuestionState.NOT_VISITED,
  })
  state: QuestionState;

  @Column({ type: 'timestamptz', nullable: true })
  answeredAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
