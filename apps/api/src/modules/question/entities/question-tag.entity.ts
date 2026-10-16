import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { QuestionEntity } from './question.entity';

/** Free-form tag on a bank question. Stored lowercased and trimmed. */
@Entity('question_tags')
export class QuestionTagEntity {
  @PrimaryColumn({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @PrimaryColumn({ length: 50 })
  @Index()
  tag: string;

  @ManyToOne(() => QuestionEntity, (question) => question.tags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: QuestionEntity;
}
