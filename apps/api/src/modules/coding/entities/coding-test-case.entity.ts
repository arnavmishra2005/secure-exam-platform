import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { QuestionEntity } from '../../question/entities/question.entity';

/**
 * Input/expected-output pair for a coding question. Hidden cases
 * (`isSample = false`) must never reach a student-facing response.
 */
@Entity('coding_test_cases')
export class CodingTestCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_id', type: 'uuid' })
  @Index()
  questionId: string;

  @ManyToOne(() => QuestionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: QuestionEntity;

  @Column({ type: 'text', default: '' })
  input: string;

  @Column({ name: 'expected_output', type: 'text' })
  expectedOutput: string;

  @Column({ name: 'is_sample', default: false })
  isSample: boolean;

  /** Relative weight for partial marks. */
  @Column({ type: 'int', default: 1 })
  weight: number;

  @Column({ default: 0 })
  order: number;
}
