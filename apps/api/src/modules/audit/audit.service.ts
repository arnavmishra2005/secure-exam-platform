// Owner: Person A (Identity/Auth/Security)
// Shared dependency: Person B and Person C's modules call logEvent()
// directly instead of writing ad-hoc console.log or custom log tables.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditEventType } from '@secure-exam/types';
import { Repository } from 'typeorm';
import { AuditEventEntity } from './entities/audit-event.entity';

export interface AuditQueryOptions {
  type?: AuditEventType | string;
  actorId?: string;
  examId?: string;
  attemptId?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
  page?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly auditRepository: Repository<AuditEventEntity>,
  ) {}

  /**
   * Log an audit event. The `type` parameter accepts both AuditEventType
   * enum values (Person A's callers) and plain string literals (Person B
   * and C's callers who pass event names like 'EXAM_STARTED').
   * `ipAddress` is optional and defaults to null.
   */
  async logEvent(
    type: AuditEventType | string,
    metadata: Record<string, unknown> = {},
    actorId: string | null = null,
    ipAddress: string | null = null,
  ): Promise<AuditEventEntity> {
    const event = this.auditRepository.create({
      type,
      metadata,
      actorId,
      ipAddress,
      examId: (metadata?.examId as string) ?? null,
      attemptId: (metadata?.attemptId as string) ?? null,
    });
    return this.auditRepository.save(event);
  }

  /** Used by Person A's audit controller (GET /audit with type/actorId filters). */
  async findAll(options: AuditQueryOptions = {}): Promise<AuditEventEntity[]> {
    const { type, actorId, limit = 50, offset = 0 } = options;
    const qb = this.auditRepository.createQueryBuilder('e');
    if (type) qb.andWhere('e.type = :type', { type });
    if (actorId) qb.andWhere('e.actorId = :actorId', { actorId });
    return qb.orderBy('e.createdAt', 'DESC').skip(offset).take(limit).getMany();
  }

  /**
   * Used by B+C's richer audit viewer (GET /audit with examId/attemptId/
   * eventType/page/limit filters).
   */
  async listEvents(params: {
    examId?: string;
    attemptId?: string;
    eventType?: string;
    actorId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: AuditEventEntity[]; total: number; page: number; limit: number }> {
    const page = params.page && params.page > 0 ? Number(params.page) : 1;
    const limit = params.limit && params.limit > 0 ? Number(params.limit) : 50;

    const qb = this.auditRepository.createQueryBuilder('e');
    if (params.examId) qb.andWhere('e.examId = :examId', { examId: params.examId });
    if (params.attemptId) qb.andWhere('e.attemptId = :attemptId', { attemptId: params.attemptId });
    if (params.eventType) qb.andWhere('e.type = :type', { type: params.eventType });
    if (params.actorId) qb.andWhere('e.actorId = :actorId', { actorId: params.actorId });

    const total = await qb.getCount();
    const items = await qb
      .orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { items, total, page, limit };
  }
}
