// Owner: Person A (Platform, Courses, Publish, Results)
//
// "Publish" = make the exam visible to every registered student and send
// each of them an in-app notification. A DRAFT exam is scheduled as part of
// publishing. Emits exam.published (Person B snapshots questions on it).

import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditEventType, ExamStatus } from '@secure-exam/types';
import type { Exam, PublishExamResponse, PublishReadiness } from '@secure-exam/types';
import { PublishExamDto } from '@secure-exam/validation';
import { Repository } from 'typeorm';
import { EXAM_PUBLISHED, ExamPublishedEvent } from '../../common/events/events';
import { AuditService } from '../audit/audit.service';
import { examPublishedNotification, RegistrationService } from '../course/registration.service';
import { ExamEntity } from '../exam/entities/exam.entity';
import { ExamService } from '../exam/exam.service';
import { NotificationService } from '../notification/notification.service';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    @InjectRepository(ExamEntity)
    private readonly examRepo: Repository<ExamEntity>,
    @InjectRepository(ExamQuestionEntity)
    private readonly examQuestionRepo: Repository<ExamQuestionEntity>,
    private readonly examService: ExamService,
    private readonly registrationService: RegistrationService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async readiness(examId: string): Promise<PublishReadiness> {
    const exam = await this.examService.findOne(examId);
    const [registeredCount, questionCount] = await Promise.all([
      this.registrationService.countForExam(examId),
      this.examQuestionRepo.count({ where: { examId } }),
    ]);

    const problems: string[] = [];
    if (exam.publishedAt) problems.push('The exam is already published.');
    if (exam.status === ExamStatus.CLOSED) problems.push('The exam is closed.');
    if (exam.endTime.getTime() <= Date.now()) problems.push('The exam window has already ended.');
    if (questionCount === 0) problems.push('The exam has no questions.');
    if (registeredCount === 0) problems.push('No students are registered. Assign a course or add students first.');

    return { examId, canPublish: problems.length === 0, registeredCount, questionCount, problems };
  }

  async publish(examId: string, dto: PublishExamDto, actorId: string): Promise<PublishExamResponse> {
    const readiness = await this.readiness(examId);
    if (!readiness.canPublish) {
      const alreadyPublished = readiness.problems[0] === 'The exam is already published.';
      const message = readiness.problems.join(' ');
      throw alreadyPublished ? new ConflictException(message) : new BadRequestException(message);
    }

    let exam = await this.examService.findOne(examId);
    if (exam.status === ExamStatus.DRAFT) {
      exam = await this.examService.schedule(examId, actorId);
    }

    // Conditional update so two concurrent publishes can't both notify.
    const publishedAt = new Date();
    const updated = await this.examRepo
      .createQueryBuilder()
      .update(ExamEntity)
      .set({ publishedAt, ...(dto.passPercentage !== undefined ? { passPercentage: dto.passPercentage } : {}) })
      .where('id = :examId AND published_at IS NULL', { examId })
      .execute();
    if (updated.affected !== 1) throw new ConflictException('The exam is already published.');

    exam = await this.examService.findOne(examId);
    const userIds = await this.registrationService.registeredUserIds(examId);
    const notifiedCount = await this.notificationService.notifyMany(
      userIds,
      examPublishedNotification(exam, dto.message),
    );

    await this.auditService.logEvent(
      AuditEventType.EXAM_PUBLISHED,
      { examId, notifiedCount, passPercentage: exam.passPercentage },
      actorId,
    );

    const event: ExamPublishedEvent = { examId, publishedAt, actorId };
    try {
      await this.events.emitAsync(EXAM_PUBLISHED, event);
    } catch (err) {
      // The exam is published either way; a failing listener must not turn that into a 500.
      this.logger.error(`An ${EXAM_PUBLISHED} listener failed for exam ${examId}`, err instanceof Error ? err.stack : undefined);
    }

    return { exam: toExamDto(exam), notifiedCount };
  }
}

export function toExamDto(entity: ExamEntity): Exam {
  return {
    id: entity.id,
    title: entity.title,
    description: entity.description,
    durationMinutes: entity.durationMinutes,
    startTime: entity.startTime.toISOString(),
    endTime: entity.endTime.toISOString(),
    status: entity.status,
    publishedAt: entity.publishedAt ? entity.publishedAt.toISOString() : null,
    passPercentage: entity.passPercentage,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
