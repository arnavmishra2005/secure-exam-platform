import { Column, Entity, PrimaryColumn } from 'typeorm';
@Entity('exam_captchas')
export class CaptchaEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 64 }) answerHash!: string;
  @Column({ type: 'timestamptz' }) expiresAt!: Date;
}
