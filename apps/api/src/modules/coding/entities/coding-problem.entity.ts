import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CodeLanguage, OutputComparisonMode, StarterCode } from '@secure-exam/types';
import { QuestionEntity } from '../../question/entities/question.entity';

/**
 * The coding details of a CODING question (one row per question). The
 * question's `text` stays a short title; the full statement lives here.
 */
@Entity('coding_problems')
export class CodingProblemEntity {
  @PrimaryColumn({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @OneToOne(() => QuestionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: QuestionEntity;

  @Column({ name: 'statement_md', type: 'text' })
  statementMd: string;

  @Column({ name: 'starter_code', type: 'jsonb', default: () => `'{}'` })
  starterCode: StarterCode;

  @Column({
    name: 'allowed_languages',
    type: 'text',
    array: true,
    default: () => `'{python}'`,
  })
  allowedLanguages: CodeLanguage[];

  @Column({ name: 'time_limit_ms', type: 'int', default: 2000 })
  timeLimitMs: number;

  @Column({ name: 'memory_limit_mb', type: 'int', default: 256 })
  memoryLimitMb: number;

  @Column({
    name: 'comparison_mode',
    type: 'enum',
    enum: OutputComparisonMode,
    default: OutputComparisonMode.TRIM,
  })
  comparisonMode: OutputComparisonMode;

  /** Never sent to students. */
  @Column({ name: 'reference_solution', type: 'text', nullable: true })
  referenceSolution: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
