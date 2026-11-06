/**
 * Owner: Person B (writes into Person C's `security_events` table).
 *
 * Where suspicious-code flags go. The default writes a `SUSPICIOUS_CODE` row
 * to `security_events`, so the attempt's violation count on Monitoring and
 * Results includes it, plus an audit line with the exam and attempt ids.
 * It never blocks or changes a score: a flag is for a human to review.
 *
 * Ask for C at merge: a display label for SUSPICIOUS_CODE in the Monitoring
 * event list. It is deliberately NOT in DESKTOP_VIOLATION_TYPES, because only
 * the server may report it (the exam app must not be able to send or forge it).
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditEventType } from '@secure-exam/types';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SecurityEventEntity } from '../client-security/entities/security-event.entity';

export const SUSPICIOUS_CODE_SINK = Symbol('SUSPICIOUS_CODE_SINK');

/** `security_events.type` of a flag raised by the code runner. */
export const SUSPICIOUS_CODE_EVENT = 'SUSPICIOUS_CODE';

export interface SuspiciousCodeEvent {
  attemptId: string;
  examId: string;
  studentId: string;
  questionId?: string;
  /** Short reason code, e.g. BLOCKED_SYSCALL. */
  reason: string;
  /** Human-readable, at most 300 characters. */
  detail: string;
}

export interface SuspiciousCodeSink {
  report(event: SuspiciousCodeEvent): Promise<void>;
}

@Injectable()
export class SecurityEventSuspiciousCodeSink implements SuspiciousCodeSink {
  private readonly logger = new Logger(SecurityEventSuspiciousCodeSink.name);

  constructor(
    @InjectRepository(SecurityEventEntity) private readonly events: Repository<SecurityEventEntity>,
    private readonly audit: AuditService,
  ) {}

  async report(event: SuspiciousCodeEvent): Promise<void> {
    try {
      await this.events.insert({
        attemptId: event.attemptId,
        examId: event.examId,
        studentId: event.studentId,
        type: SUSPICIOUS_CODE_EVENT,
        detail: event.detail.slice(0, 300),
        occurredAt: new Date(),
      });
    } catch (err) {
      this.logger.warn(`Could not store a suspicious-code flag for attempt ${event.attemptId}: ${(err as Error).message}`);
    }
    try {
      await this.audit.logEvent(
        AuditEventType.SUSPICIOUS_CODE,
        { examId: event.examId, attemptId: event.attemptId, questionId: event.questionId, reason: event.reason, detail: event.detail },
        event.studentId,
      );
    } catch (err) {
      this.logger.warn(`Could not write the audit line for a suspicious-code flag: ${(err as Error).message}`);
    }
  }
}
