// Owner: Person A (Platform, Courses, Publish, Results)

import { RegistrationSource } from '@secure-exam/types';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Who may sit an exam. Replaces Phase 1's exam_assignments (migrated by
 * 1792368001000-A-CreateCourses). `studentId` is a students.id.
 *
 * A student has at most one registration per exam. When it came from a
 * course, `courseId` records which one; if that course is later removed but
 * another assigned course still covers the student, the row is re-pointed
 * rather than deleted.
 */
@Entity('exam_registrations')
@Unique('UQ_exam_registrations_exam_student', ['examId', 'studentId'])
export class ExamRegistrationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_exam_registrations_examId')
  @Column({ type: 'uuid' })
  examId!: string;

  @Index('IDX_exam_registrations_studentId')
  @Column({ type: 'uuid' })
  studentId!: string;

  @Column({
    type: 'enum',
    enum: RegistrationSource,
    enumName: 'registration_source_enum',
    default: RegistrationSource.MANUAL,
  })
  source!: RegistrationSource;

  @Column({ type: 'uuid', nullable: true })
  courseId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  registeredAt!: Date;
}
