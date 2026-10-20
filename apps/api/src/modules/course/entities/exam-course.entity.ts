// Owner: Person A (Platform, Courses, Publish, Results)

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** An exam assigned to a course: every enrolled student is registered for the exam. */
@Entity('exam_courses')
@Unique('UQ_exam_courses_exam_course', ['examId', 'courseId'])
export class ExamCourseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_exam_courses_examId')
  @Column({ type: 'uuid' })
  examId!: string;

  @Index('IDX_exam_courses_courseId')
  @Column({ type: 'uuid' })
  courseId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
