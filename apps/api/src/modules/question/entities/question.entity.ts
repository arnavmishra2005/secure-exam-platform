import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionType } from '@secure-exam/types';
import { OptionEntity } from './option.entity';

@Entity('questions')
export class QuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'enum', enum: QuestionType })
  type: QuestionType;

  @Column({ type: 'float' })
  marks: number;

  @Column({ name: 'negative_marks', type: 'float', nullable: true })
  negativeMarks?: number;

  @Column({ type: 'text', nullable: true })
  explanation?: string;

  @OneToMany(() => OptionEntity, (option) => option.question, { cascade: true })
  options: OptionEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
