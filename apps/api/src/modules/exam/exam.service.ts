import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { EXAM_STATUS_TRANSITIONS, ExamStatus, NotificationType } from '@secure-exam/types';
import { AuditEventType } from '@secure-exam/types';
import { AuditService } from '../audit/audit.service';
import { ExamEntity } from './entities/exam.entity';
import { CreateExamDto, RescheduleExamDto, UpdateExamDto } from '@secure-exam/validation';
import { RegistrationService } from '../course/registration.service';

@Injectable()
export class ExamService {
  constructor(
    @InjectRepository(ExamEntity)
    private readonly examRepo: Repository<ExamEntity>,
    private readonly registrationService: RegistrationService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------

  /**
   * A new draft owned by `dto.courseId` (the caller's access to that course is
   * checked by the controller). The course is also assigned, so its enrolled
   * students are registered.
   */
  async create(dto: CreateExamDto, actorId: string): Promise<ExamEntity> {
    this.assertValidWindow(dto.startTime, dto.endTime);

    const exam = this.examRepo.create({
      title: dto.title,
      description: dto.description,
      durationMinutes: dto.durationMinutes,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      status: ExamStatus.DRAFT,
      passPercentage: dto.passPercentage ?? 40,
      passMarkEnabled: dto.passMarkEnabled ?? true,
      courseId: dto.courseId,
      publishedAt: null,
    });
    const saved = await this.examRepo.save(exam);

    await this.auditService.logEvent(
      AuditEventType.EXAM_CREATED,
      { examId: saved.id, title: saved.title, courseId: dto.courseId },
      actorId,
    );
    await this.registrationService.assignCourse(saved.id, dto.courseId, actorId);
    return saved;
  }

  /** Exams owned by `courseIds` (the courses the caller may see exams on), newest first. */
  findAll(courseIds: string[]): Promise<ExamEntity[]> {
    if (courseIds.length === 0) return Promise.resolve([]);
    return this.examRepo.find({ where: { courseId: In(courseIds) }, order: { createdAt: 'DESC' } });
  }

  findManyByIds(ids: string[]): Promise<ExamEntity[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.examRepo.find({ where: { id: In(ids) } });
  }

  async findOne(id: string): Promise<ExamEntity> {
    const exam = await this.examRepo.findOne({ where: { id } });
    if (!exam) throw new NotFoundException(`Exam ${id} not found`);
    return exam;
  }

  async update(id: string, dto: UpdateExamDto, actorId: string): Promise<ExamEntity> {
    const exam = await this.findOne(id);

    if (exam.status !== ExamStatus.DRAFT && (dto.startTime || dto.endTime || dto.durationMinutes)) {
      throw new BadRequestException(
        'Timing can only be edited here while the exam is a draft. Use Reschedule instead.',
      );
    }

    const nextStart = dto.startTime ? new Date(dto.startTime) : exam.startTime;
    const nextEnd = dto.endTime ? new Date(dto.endTime) : exam.endTime;
    this.assertValidWindow(nextStart.toISOString(), nextEnd.toISOString());

    Object.assign(exam, {
      title: dto.title ?? exam.title,
      description: dto.description ?? exam.description,
      durationMinutes: dto.durationMinutes ?? exam.durationMinutes,
      startTime: nextStart,
      endTime: nextEnd,
      passPercentage: dto.passPercentage ?? exam.passPercentage,
      passMarkEnabled: dto.passMarkEnabled ?? exam.passMarkEnabled,
    });
    const saved = await this.examRepo.save(exam);

    await this.auditService.logEvent(
      AuditEventType.EXAM_UPDATED,
      { examId: saved.id, changes: dto },
      actorId,
    );
    return saved;
  }

  /**
   * Moves a scheduled, active or published exam.
   * - Nobody has started: any change that leaves a valid window the duration fits in.
   * - Someone has started: only the end time, and only later. Running attempts
   *   keep their own expiry; give them more time with an extension instead.
   * - CLOSED: refused.
   * The first time a published exam's start moves, the old start is kept as
   * originalStartTime so students see that it was rescheduled.
   */
  async reschedule(id: string, dto: RescheduleExamDto, actorId: string): Promise<ExamEntity> {
    const exam = await this.findOne(id);
    if (exam.status === ExamStatus.CLOSED) {
      throw new BadRequestException('A closed exam cannot be rescheduled');
    }
    if (dto.startTime === undefined && dto.endTime === undefined && dto.durationMinutes === undefined && dto.note === undefined) {
      throw new BadRequestException('Nothing to change');
    }

    const nextStart = dto.startTime ? new Date(dto.startTime) : exam.startTime;
    const nextEnd = dto.endTime ? new Date(dto.endTime) : exam.endTime;
    const nextDuration = dto.durationMinutes ?? exam.durationMinutes;
    const startMoved = nextStart.getTime() !== exam.startTime.getTime();

    const [{ count }]: { count: string }[] = await this.examRepo.query(
      `SELECT COUNT(*) AS count FROM "attempts" WHERE "examId" = $1`,
      [id],
    );
    if (Number(count) > 0) {
      if (startMoved || nextDuration !== exam.durationMinutes) {
        throw new BadRequestException(
          'Students have already started this exam, so only its end time can change. Use Extend time to give them more time.',
        );
      }
      if (nextEnd.getTime() < exam.endTime.getTime()) {
        throw new BadRequestException('Students have already started this exam, so its end time can only move later.');
      }
    }

    this.assertValidWindow(nextStart.toISOString(), nextEnd.toISOString());
    if (nextDuration * 60_000 > nextEnd.getTime() - nextStart.getTime()) {
      throw new BadRequestException('The duration is longer than the window between the start and end times');
    }

    const before = {
      startTime: exam.startTime.toISOString(),
      endTime: exam.endTime.toISOString(),
      durationMinutes: exam.durationMinutes,
    };
    if (exam.publishedAt && startMoved && !exam.originalStartTime) exam.originalStartTime = exam.startTime;
    exam.startTime = nextStart;
    exam.endTime = nextEnd;
    exam.durationMinutes = nextDuration;
    if (dto.note !== undefined) exam.scheduleNote = dto.note.trim() || null;
    const saved = await this.examRepo.save(exam);

    await this.auditService.logEvent(
      AuditEventType.EXAM_RESCHEDULED,
      {
        examId: id,
        before,
        after: { startTime: nextStart.toISOString(), endTime: nextEnd.toISOString(), durationMinutes: nextDuration },
        note: saved.scheduleNote,
      },
      actorId,
    );
    if (saved.publishedAt) {
      await this.registrationService.notifyRegistered(id, {
        type: NotificationType.EXAM_RESCHEDULED,
        title: `Rescheduled: ${saved.title}`,
        // Times go in `data`: the dashboard shows them in the student's own time zone.
        body: `"${saved.title}" has new times. Check your dashboard.` + (saved.scheduleNote ? ` ${saved.scheduleNote}` : ''),
        data: { examId: id, startTime: nextStart.toISOString(), endTime: nextEnd.toISOString() },
      });
    }
    return saved;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const exam = await this.findOne(id);
    if (exam.status !== ExamStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT exams can be deleted');
    }
    await this.examRepo.remove(exam);
    await this.auditService.logEvent(AuditEventType.EXAM_DELETED, { examId: id }, actorId);
  }

  // ---------------------------------------------------------------------
  // State machine
  // ---------------------------------------------------------------------

  async schedule(id: string, actorId: string): Promise<ExamEntity> {
    return this.transition(id, ExamStatus.SCHEDULED, AuditEventType.EXAM_SCHEDULED, actorId);
  }

  async start(id: string, actorId: string): Promise<ExamEntity> {
    return this.transition(id, ExamStatus.ACTIVE, AuditEventType.EXAM_STARTED, actorId);
  }

  async close(id: string, actorId: string): Promise<ExamEntity> {
    return this.transition(id, ExamStatus.CLOSED, AuditEventType.EXAM_CLOSED, actorId);
  }

  private async transition(
    id: string,
    next: ExamStatus,
    auditType: AuditEventType,
    actorId: string,
  ): Promise<ExamEntity> {
    const exam = await this.findOne(id);
    this.validateTransition(exam.status, next);
    exam.status = next;
    const saved = await this.examRepo.save(exam);
    await this.auditService.logEvent(auditType, { examId: id, status: next }, actorId);
    return saved;
  }

  private validateTransition(current: ExamStatus, next: ExamStatus) {
    const allowed = EXAM_STATUS_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`Invalid transition: ${current} -> ${next}`);
    }
  }

  private assertValidWindow(startTimeIso: string, endTimeIso: string) {
    if (new Date(startTimeIso).getTime() >= new Date(endTimeIso).getTime()) {
      throw new BadRequestException('startTime must be before endTime');
    }
  }

  // ---------------------------------------------------------------------
  // Time extension (Person A implements; Person C's ExtensionService calls it)
  // ---------------------------------------------------------------------

  /**
   * Pushes the exam's end time by `minutes`, so students who haven't started
   * yet can still start and running attempts aren't capped by the old end.
   * Running attempts' own expiry is moved by the caller (ExtensionService),
   * inside the same transaction via `manager`.
   */
  async extendEndTime(examId: string, minutes: number, manager?: EntityManager): Promise<ExamEntity> {
    if (!Number.isInteger(minutes) || minutes <= 0) {
      throw new BadRequestException('minutes must be a positive whole number');
    }
    const repo = manager ? manager.getRepository(ExamEntity) : this.examRepo;
    const exam = await repo.findOne({ where: { id: examId }, lock: manager ? { mode: 'pessimistic_write' } : undefined });
    if (!exam) throw new NotFoundException(`Exam ${examId} not found`);
    if (exam.status === ExamStatus.CLOSED || exam.status === ExamStatus.DRAFT) {
      throw new BadRequestException(`A ${exam.status} exam cannot be extended`);
    }

    exam.endTime = new Date(exam.endTime.getTime() + minutes * 60_000);
    return repo.save(exam);
  }

  // ---------------------------------------------------------------------
  // Student assignment — Phase 1 routes, now backed by exam registrations
  // (modules/course).
  // ---------------------------------------------------------------------

  async listAssignedStudents(examId: string) {
    const registrations = await this.registrationService.listForExam(examId);
    return registrations.map((r) => ({
      id: r.id,
      examId: r.examId,
      studentId: r.studentId,
      userId: r.student.userId,
      assignedAt: r.registeredAt,
      source: r.source,
      studentInfo: {
        userId: r.student.userId,
        collegeId: r.student.collegeId,
        fullName: r.student.fullName,
        email: r.student.email,
      },
    }));
  }

  async assignStudent(examId: string, studentId: string, actorId: string) {
    const result = await this.registrationService.registerStudents(examId, [studentId], actorId);
    if (result.notFound.length > 0) {
      throw new NotFoundException(
        `Student with ID "${studentId}" does not exist. Make sure the student is added in the Students section first.`,
      );
    }
    if (result.registeredCount === 0) {
      throw new ConflictException('Student is already assigned to this exam');
    }
    const [registration] = (await this.listAssignedStudents(examId)).filter(
      (r) => r.studentId === studentId || r.userId === studentId,
    );
    return registration;
  }

  async unassignStudent(examId: string, studentId: string, actorId: string): Promise<void> {
    await this.registrationService.unregisterStudent(examId, studentId, actorId);
  }
}
