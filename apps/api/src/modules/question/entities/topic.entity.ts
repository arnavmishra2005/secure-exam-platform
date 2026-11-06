import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** A bank topic, optionally scoped to one of Person A's courses (by ID only). */
@Entity('topics')
@Unique('UQ_topics_course_name', ['courseId', 'name'])
export class TopicEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  @Index()
  courseId: string | null;

  /** Person A: users.id of the instructor whose question bank the topic is in. */
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  @Index()
  ownerId: string | null;

  @Column({ length: 100 })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
