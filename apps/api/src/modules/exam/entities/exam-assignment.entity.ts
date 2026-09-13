import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ExamEntity } from './exam.entity';

/**
 * Links a student to an exam they're allowed to attempt.
 *
 * ASSUMPTION (needs sync with Person A): the student/user table is named
 * `users` with a uuid primary key `id`. We only store `studentId` as a
 * plain column + FK constraint (added in the migration) rather than a
 * TypeORM ManyToOne relation to a UserEntity, per the architecture doc's
 * rule: "C's Attempt entity references B's Exam/Question entities by ID
 * only, never by importing the other module's service directly" — the
 * same loose-coupling applies here in reverse (B referencing A's table).
 */
@Entity('exam_assignments')
@Unique('UQ_exam_student', ['examId', 'studentId'])
export class ExamAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'exam_id' })
  @Index()
  examId: string;

  @ManyToOne(() => ExamEntity, (exam) => exam.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam: ExamEntity;

  @Column({ name: 'student_id' })
  @Index()
  studentId: string;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;
}
