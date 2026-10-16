import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CodeLanguage, CodeSubmissionStatus, StoredTestResult } from '@secure-exam/types';

/**
 * One "Submit" (or the end-of-attempt grading of the latest draft) for a
 * coding question. `isFinal` marks the one row per attempt+question that
 * counted for marks. Attempt and student are referenced by ID only.
 */
@Entity('code_submissions')
@Index('IDX_code_submissions_attempt_question', ['attemptId', 'questionId'])
export class CodeSubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  /** users.id (JWT sub). */
  @Column({ name: 'student_id', type: 'uuid' })
  @Index()
  studentId: string;

  @Column({ type: 'varchar', length: 20 })
  language: CodeLanguage;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'enum', enum: CodeSubmissionStatus })
  status: CodeSubmissionStatus;

  @Column({ type: 'int', default: 0 })
  passed: number;

  @Column({ type: 'int', default: 0 })
  total: number;

  @Column({ type: 'double precision', default: 0 })
  score: number;

  @Column({ name: 'max_score', type: 'double precision', default: 0 })
  maxScore: number;

  /** Per-test detail, admin-only. */
  @Column({ name: 'results_json', type: 'jsonb', default: () => `'[]'` })
  resultsJson: StoredTestResult[];

  /** True for the submission that counted for marks at the end of the attempt. */
  @Column({ name: 'is_final', default: false })
  isFinal: boolean;

  /** True when this row was created by grading the saved draft at attempt end. */
  @Column({ name: 'from_draft', default: false })
  fromDraft: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
