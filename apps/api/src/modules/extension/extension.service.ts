/**
 * Owner: Person C (Time Extension, Dashboard)
 *
 * Whole exam (scope ALL): the exam's end time moves (ExamService.extendEndTime,
 * Person A) and every running attempt's expiry moves with it, in one
 * transaction. Students who haven't started get the later end time.
 *
 * One student (scope STUDENT): only their running attempt's expiry moves —
 * it may run past the exam's end time, which is the point. If they haven't
 * started yet, the minutes are added when they do (AttemptService).
 *
 * Running clients learn the new expiry from their next heartbeat.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { AttemptStatus, ExamStatus, ExtensionScope, NotificationType } from '@secure-exam/types';
import type { ExamExtension } from '@secure-exam/types';
import { ExtendTimeDto } from '@secure-exam/validation';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EXAM_EXTENDED, ExamExtendedEvent } from '../../common/events/events';
import { logAuditSafely } from '../attempt/audit-safe.util';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { AuditService } from '../audit/audit.service';
import { RegistrationService } from '../course/registration.service';
import { ExamService } from '../exam/exam.service';
import { NotificationService } from '../notification/notification.service';
import { UserService } from '../user/user.service';
import { ExamExtensionEntity } from './entities/exam-extension.entity';

@Injectable()
export class ExtensionService {
  private readonly logger = new Logger(ExtensionService.name);

  constructor(
    @InjectRepository(ExamExtensionEntity)
    private readonly extensionRepo: Repository<ExamExtensionEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly examService: ExamService,
    private readonly registrationService: RegistrationService,
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async listForExam(examId: string): Promise<ExamExtension[]> {
    await this.examService.findOne(examId);
    const rows = await this.extensionRepo.find({ where: { examId }, order: { createdAt: 'DESC' } });
    return rows.map(toExtensionDto);
  }

  async extend(examId: string, dto: ExtendTimeDto, actorId: string): Promise<ExamExtension> {
    const exam = await this.examService.findOne(examId);
    if (exam.status === ExamStatus.CLOSED || exam.status === ExamStatus.DRAFT) {
      throw new BadRequestException(`A ${exam.status} exam cannot be extended`);
    }

    const studentUserId = dto.studentId ? await this.resolveStudentUserId(examId, dto.studentId) : null;
    const scope = studentUserId ? ExtensionScope.STUDENT : ExtensionScope.ALL;

    const extension = await this.dataSource.transaction(async (manager) => {
      if (scope === ExtensionScope.ALL) {
        await this.examService.extendEndTime(examId, dto.minutes, manager);
      }
      const affectedAttempts = await this.pushRunningAttempts(manager, examId, dto.minutes, studentUserId);

      if (studentUserId && affectedAttempts === 0) {
        const finished = await manager.getRepository(AttemptEntity).findOne({
          where: { examId, studentId: studentUserId },
        });
        if (finished) {
          throw new ConflictException('This student has already submitted the exam; their time cannot be extended');
        }
      }

      const repo = manager.getRepository(ExamExtensionEntity);
      return repo.save(
        repo.create({
          examId,
          scope,
          studentId: studentUserId,
          minutes: dto.minutes,
          reason: dto.reason?.trim() || null,
          createdBy: actorId,
          affectedAttempts,
        }),
      );
    });

    await logAuditSafely(
      this.logger,
      this.auditService,
      'EXAM_TIME_EXTENDED',
      {
        examId,
        extensionId: extension.id,
        scope,
        studentId: studentUserId,
        minutes: dto.minutes,
        affectedAttempts: extension.affectedAttempts,
      },
      actorId,
    );
    await this.notifyStudents(exam.title, extension);

    const event: ExamExtendedEvent = {
      extensionId: extension.id,
      examId,
      studentId: studentUserId,
      minutes: dto.minutes,
      actorId,
    };
    try {
      await this.events.emitAsync(EXAM_EXTENDED, event);
    } catch (err) {
      this.logger.error(`An ${EXAM_EXTENDED} listener failed`, err instanceof Error ? err.stack : undefined);
    }

    return toExtensionDto(extension);
  }

  /**
   * One UPDATE: Postgres row-locks each attempt it touches, and the status
   * condition is re-checked under that lock, so an attempt that a concurrent
   * submit/sweep finalizes first is simply skipped.
   */
  private async pushRunningAttempts(
    manager: EntityManager,
    examId: string,
    minutes: number,
    studentUserId: string | null,
  ): Promise<number> {
    const qb = manager
      .createQueryBuilder()
      .update(AttemptEntity)
      .set({ expiresAt: () => `"expiresAt" + (:minutes * INTERVAL '1 minute')` })
      .where('"examId" = :examId', { examId })
      .andWhere('status = :status', { status: AttemptStatus.IN_PROGRESS })
      .setParameter('minutes', minutes);
    if (studentUserId) qb.andWhere('"studentId" = :studentId', { studentId: studentUserId });

    const result = await qb.returning(['id']).execute();
    return Array.isArray(result.raw) ? result.raw.length : result.affected ?? 0;
  }

  /** Accepts a users.id or a students.id; the student must be registered or already attempting. */
  private async resolveStudentUserId(examId: string, identifier: string): Promise<string> {
    const { found } = await this.userService.resolveStudents([identifier]);
    const student = found.get(identifier);
    if (!student) throw new NotFoundException('Student not found');

    const registered = await this.registrationService.isUserRegistered(examId, student.userId);
    if (!registered) {
      const attempt = await this.dataSource
        .getRepository(AttemptEntity)
        .findOne({ where: { examId, studentId: student.userId } });
      if (!attempt) throw new BadRequestException('This student is not registered for the exam');
    }
    return student.userId;
  }

  private async notifyStudents(examTitle: string, extension: ExamExtensionEntity): Promise<void> {
    try {
      const userIds = extension.studentId
        ? [extension.studentId]
        : await this.registrationService.registeredUserIds(extension.examId);
      await this.notificationService.notifyMany(userIds, {
        type: NotificationType.EXAM_EXTENDED,
        title: `More time: ${examTitle}`,
        body: `${extension.minutes} extra minute(s) were added to "${examTitle}".`,
        data: { examId: extension.examId, minutes: extension.minutes },
      });
    } catch (err) {
      // The extension is already in effect; a missed notification is not worth failing the request.
      this.logger.error('Could not send extension notifications', err instanceof Error ? err.stack : undefined);
    }
  }
}

export function toExtensionDto(entity: ExamExtensionEntity): ExamExtension {
  return {
    id: entity.id,
    examId: entity.examId,
    scope: entity.scope,
    studentId: entity.studentId,
    minutes: entity.minutes,
    reason: entity.reason,
    createdBy: entity.createdBy,
    affectedAttempts: entity.affectedAttempts,
    createdAt: entity.createdAt.toISOString(),
  };
}
