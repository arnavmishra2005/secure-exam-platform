import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionDifficulty, QuestionStatus, QuestionType } from '@secure-exam/types';
import { OptionEntity } from './option.entity';
import { QuestionTagEntity } from './question-tag.entity';
import { TopicEntity } from './topic.entity';

@Entity('questions')
export class QuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'enum', enum: QuestionType })
  type: QuestionType;

  @Column({ type: 'float' })
  marks: number;

  @Column({ name: 'negative_marks', type: 'float', nullable: true })
  negativeMarks?: number | null;

  @Column({ type: 'text', nullable: true })
  explanation?: string | null;

  /** Person A's courses.id, referenced by ID only (no FK). */
  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  @Index()
  courseId: string | null;

  @Column({ name: 'topic_id', type: 'uuid', nullable: true })
  @Index()
  topicId: string | null;

  @ManyToOne(() => TopicEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'topic_id' })
  topic?: TopicEntity | null;

  @Column({ type: 'enum', enum: QuestionDifficulty, nullable: true })
  difficulty: QuestionDifficulty | null;

  @Column({ type: 'enum', enum: QuestionStatus, default: QuestionStatus.READY })
  status: QuestionStatus;

  @OneToMany(() => QuestionTagEntity, (tag) => tag.question, { cascade: true })
  tags: QuestionTagEntity[];

  @OneToMany(() => OptionEntity, (option) => option.question, { cascade: true })
  options: OptionEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
