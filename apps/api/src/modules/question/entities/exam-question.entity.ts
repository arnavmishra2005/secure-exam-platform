import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ExamEntity } from '../../exam/entities/exam.entity';
import { QuestionEntity } from './question.entity';

/**
 * Maps a Question into an Exam with a per-exam display order. Kept as a
 * first-class entity (not a plain many-to-many) per the architecture note:
 * "put ExamQuestion in the question/exam-content area but treat it as a
 * first-class entity, because C will eventually depend on the relationship
 * between an exam and its questions."
 */
@Entity('exam_questions')
@Unique('UQ_exam_question', ['examId', 'questionId'])
export class ExamQuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'exam_id' })
  @Index()
  examId: string;

  @ManyToOne(() => ExamEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam: ExamEntity;

  @Column({ name: 'question_id' })
  @Index()
  questionId: string;

  @ManyToOne(() => QuestionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: QuestionEntity;

  @Column({ default: 0 })
  order: number;
}
