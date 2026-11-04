// Owner: Person A (Identity/Auth/Security)
// Who teaches a course: its instructors (who may do everything on it) and its
// TAs (who may do only what `permissions` lists). AccessService reads this.

import { CourseStaffRole, Permission } from '@secure-exam/types';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('course_staff')
@Unique('UQ_course_staff_course_user', ['courseId', 'userId'])
export class CourseStaffEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_course_staff_courseId')
  @Column({ type: 'uuid' })
  courseId!: string;

  /** users.id */
  @Index('IDX_course_staff_userId')
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: CourseStaffRole, enumName: 'course_staff_role_enum' })
  role!: CourseStaffRole;

  /** TAs only; ignored for instructors. */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  permissions!: Permission[];

  /** users.id of the instructor who added them; null for the course's creator. */
  @Column({ type: 'uuid', nullable: true })
  addedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
