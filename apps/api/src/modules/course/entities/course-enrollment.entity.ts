// Owner: Person A (Platform, Courses, Publish, Results)

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** `studentId` is a students.id (not a users.id). */
@Entity('course_enrollments')
@Unique('UQ_course_enrollments_course_student', ['courseId', 'studentId'])
export class CourseEnrollmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_course_enrollments_courseId')
  @Column({ type: 'uuid' })
  courseId!: string;

  @Index('IDX_course_enrollments_studentId')
  @Column({ type: 'uuid' })
  studentId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  enrolledAt!: Date;
}
