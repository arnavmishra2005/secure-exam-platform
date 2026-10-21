// Owner: Person C (Electron, Kiosk & Security)

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditEventType, NON_VIOLATION_TYPES } from '@secure-exam/types';
import type { DesktopViolationType, JwtPayload, SecurityEventView } from '@secure-exam/types';
import type { ReportSecurityEventsDto } from '@secure-exam/validation';
import { In, Not, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { SecurityEventEntity } from './entities/security-event.entity';

/** A runaway or hostile client cannot grow the table without bound. */
const MAX_EVENTS_PER_ATTEMPT = 2000;
const DEFAULT_FLAG_THRESHOLD = 5;

@Injectable()
export class ClientSecurityService {
  private readonly logger = new Logger(ClientSecurityService.name);

  constructor(
    @InjectRepository(SecurityEventEntity) private readonly events: Repository<SecurityEventEntity>,
    @InjectRepository(AttemptEntity) private readonly attempts: Repository<AttemptEntity>,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Stores a batch of events for the caller's own attempt. */
  async record(attemptId: string, user: JwtPayload, dto: ReportSecurityEventsDto): Promise<{ recorded: number }> {
    const attempt = await this.attempts.findOne({ where: { id: attemptId } });
    // 404 and not 403 for someone else's attempt: do not reveal that it exists.
    if (!attempt || attempt.studentId !== user.sub) throw new NotFoundException('Attempt not found');

    const existing = await this.events.count({ where: { attemptId } });
    const room = Math.max(MAX_EVENTS_PER_ATTEMPT - existing, 0);
    const accepted = dto.events.slice(0, room);
    if (accepted.length === 0) return { recorded: 0 };

    await this.events.insert(
      accepted.map((e) => ({
        attemptId,
        examId: attempt.examId,
        studentId: attempt.studentId,
        type: e.type,
        detail: e.detail ?? null,
        occurredAt: new Date(e.occurredAt),
      })),
    );

    // One audit line per batch, with the exam and attempt ids so the audit viewer can filter on them.
    try {
      await this.auditService.logEvent(
        AuditEventType.SECURITY_VIOLATION,
        {
          examId: attempt.examId,
          attemptId,
          count: accepted.length,
          types: [...new Set(accepted.map((e) => e.type))],
          details: accepted.map((e) => e.detail).filter(Boolean).slice(0, 10),
        },
        user.sub,
      );
    } catch (err) {
      this.logger.warn(`Could not write the audit line for attempt ${attemptId}: ${(err as Error).message}`);
    }
    return { recorded: accepted.length };
  }

  /** Every event of an attempt, oldest first. Admin only (enforced on the controller). */
  async list(attemptId: string): Promise<SecurityEventView[]> {
    const attempt = await this.attempts.findOne({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    const rows = await this.events.find({ where: { attemptId }, order: { occurredAt: 'ASC', createdAt: 'ASC' } });
    return rows.map((r) => ({
      id: r.id,
      attemptId: r.attemptId,
      type: r.type as DesktopViolationType,
      detail: r.detail,
      occurredAt: r.occurredAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Violations per attempt, not counting informational events (focus regained, lost heartbeat). */
  async countByAttempt(attemptIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (attemptIds.length === 0) return counts;
    const rows = await this.events
      .createQueryBuilder('e')
      .select('e.attemptId', 'attemptId')
      .addSelect('COUNT(*)', 'count')
      .where({ attemptId: In(attemptIds), type: Not(In([...NON_VIOLATION_TYPES])) })
      .groupBy('e.attemptId')
      .getRawMany<{ attemptId: string; count: string }>();
    for (const row of rows) counts.set(row.attemptId, Number(row.count));
    return counts;
  }

  /** Violations at which an attempt is flagged for review. */
  flagThreshold(): number {
    return Number(this.config.get('VIOLATION_FLAG_THRESHOLD')) || DEFAULT_FLAG_THRESHOLD;
  }
}
