import { Column, Entity, PrimaryColumn } from 'typeorm';
@Entity('exam_refresh_sessions')
export class ExamRefreshSessionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column('uuid') examId!: string;
  @Column({ type: 'varchar' }) tokenHash!: string;
  @Column({ type: 'timestamptz' }) expiresAt!: Date;
}
