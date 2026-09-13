import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuestionEntity } from './question.entity';

@Entity('options')
export class OptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_id' })
  @Index()
  questionId: string;

  @ManyToOne(() => QuestionEntity, (question) => question.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: QuestionEntity;

  @Column({ type: 'text' })
  text: string;

  /**
   * Never serialize this field on a student-facing/attempt endpoint.
   * See question.controller.ts for the two response shapes
   * (admin question bank vs. exam-taking / public).
   */
  @Column({ name: 'is_correct', default: false })
  isCorrect: boolean;

  @Column({ default: 0 })
  order: number;
}
