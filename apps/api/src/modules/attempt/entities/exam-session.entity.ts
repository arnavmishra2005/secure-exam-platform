import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Owner: Person C.
 *
 * Tracks a client session tied to an Attempt so the "Live Monitoring"
 * screen can distinguish an actively-connected attempt from one that's
 * gone quiet, and so a future Electron client (Phase 4) has somewhere to
 * hang focus-loss/reconnect telemetry without a schema change. Populated
 * by the lightweight heartbeat endpoint on AttemptController.
 *
 * This entity is explicitly C-owned per the file-structure doc (section 5,
 * `entities/exam-session.entity.ts`), but the exact heartbeat endpoint
 * shape isn't spelled out anywhere else in the docs — this is a reasonable
 * design filled in to make "Live monitoring: active attempts list +
 * status" (task-breakdown doc, section 5) actually work end to end.
 */
@Entity('exam_sessions')
export class ExamSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_exam_sessions_attemptId')
  attemptId: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz' })
  lastSeenAt: Date;

  /** Set once the attempt is finalized (submitted or auto-submitted). */
  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
