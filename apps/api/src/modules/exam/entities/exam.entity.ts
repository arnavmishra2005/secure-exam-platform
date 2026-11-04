import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExamStatus } from '@secure-exam/types';

@Entity('exams')
export class ExamEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'duration_minutes' })
  durationMinutes: number;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime: Date;

  @Column({
    type: 'enum',
    enum: ExamStatus,
    default: ExamStatus.DRAFT,
  })
  status: ExamStatus;

  /**
   * Person A (publish): set when the exam is published to its registered
   * students. Unpublished exams are invisible to students and can't be started.
   * Who may sit the exam lives in exam_registrations (modules/course).
   */
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** Person A (publish): pass mark as a percentage of the maximum score. */
  @Column({ name: 'pass_percentage', type: 'int', default: 40 })
  passPercentage: number;

  /** Person A: false = the exam has no pass mark (no pass/fail, no pass rate). */
  @Column({ name: 'pass_mark_enabled', type: 'boolean', default: true })
  passMarkEnabled: boolean;

  /**
   * Person A: the owning course (courses.id, by ID only). Its instructors and
   * TAs manage the exam; other staff can't see it. Null only for exams made
   * before Phase 5 that the migration couldn't place in a course.
   */
  @Index('IDX_exams_course_id')
  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId: string | null;

  /** Person A: startTime when first rescheduled after publishing; students see the change. */
  @Column({ name: 'original_start_time', type: 'timestamptz', nullable: true })
  originalStartTime: Date | null;

  /** Person A: the instructor's note about the latest reschedule. */
  @Column({ name: 'schedule_note', type: 'text', nullable: true })
  scheduleNote: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
