import {
  Column,
  CreateDateColumn,
  Entity,
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
