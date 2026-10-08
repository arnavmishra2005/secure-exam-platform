import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EXAM_STATUS_TRANSITIONS, ExamStatus } from '@secure-exam/types';
import { AuditEventType } from '@secure-exam/types';
import { AuditService } from '../audit/audit.service';
import { ExamEntity } from './entities/exam.entity';
import { ExamAssignmentEntity } from './entities/exam-assignment.entity';
import { CreateExamDto, UpdateExamDto } from '@secure-exam/validation';
import { StudentEntity } from '../user/entities/student.entity';

@Injectable()
export class ExamService {
  constructor(
    @InjectRepository(ExamEntity)
    private readonly examRepo: Repository<ExamEntity>,
    @InjectRepository(ExamAssignmentEntity)
    private readonly assignmentRepo: Repository<ExamAssignmentEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepo: Repository<StudentEntity>,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------

  async create(dto: CreateExamDto, actorId: string): Promise<ExamEntity> {
    this.assertValidWindow(dto.startTime, dto.endTime);

    const exam = this.examRepo.create({
      title: dto.title,
      description: dto.description,
      durationMinutes: dto.durationMinutes,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      status: ExamStatus.DRAFT,
    });
    const saved = await this.examRepo.save(exam);

    await this.auditService.logEvent(
      AuditEventType.EXAM_CREATED,
      { examId: saved.id, title: saved.title },
      actorId,
    );
    return saved;
  }

  findAll(): Promise<ExamEntity[]> {
    return this.examRepo.find({ order: { createdAt: 'DESC' } });
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
        'Timing/duration can only be edited while the exam is in DRAFT status',
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
    });
    const saved = await this.examRepo.save(exam);

    await this.auditService.logEvent(
      AuditEventType.EXAM_UPDATED,
      { examId: saved.id, changes: dto },
      actorId,
    );
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
  // Student assignment
  // ---------------------------------------------------------------------

  async listAssignedStudents(examId: string) {
    await this.findOne(examId); // 404 if exam missing
    const assignments = await this.assignmentRepo.find({ where: { examId } });

    // Enrich each assignment with student info via a batch lookup
    const enriched = await Promise.all(
      assignments.map(async (a) => {
        const student = await this.studentRepo.findOne({
          where: [{ id: a.studentId }, { userId: a.studentId }],
          relations: ['user'],
        });
        return {
          id: a.id,
          examId: a.examId,
          studentId: a.studentId,
          userId: student?.userId ?? student?.user?.id,
          assignedAt: a.assignedAt,
          studentInfo: student
            ? {
                userId: student.userId,
                collegeId: student.collegeId,
                fullName: student.user.fullName,
                email: student.user.email,
              }
            : undefined,
        };
      }),
    );
    return enriched;
  }

  async assignStudent(
    examId: string,
    studentId: string,
    actorId: string,
  ): Promise<ExamAssignmentEntity> {
    await this.findOne(examId);

    // Validate the student actually exists in our register
    const student = await this.studentRepo.findOne({
      where: [{ id: studentId }, { userId: studentId }],
      relations: ['user'],
    });
    if (!student) {
      throw new NotFoundException(
        `Student with ID "${studentId}" does not exist. Make sure the student is added in the Students section first.`,
      );
    }

    const existing = await this.assignmentRepo.findOne({ where: { examId, studentId } });
    if (existing) {
      throw new ConflictException(
        `Student "${student.user.fullName}" (${student.collegeId}) is already assigned to this exam`,
      );
    }

    const assignment = this.assignmentRepo.create({ examId, studentId });
    const saved = await this.assignmentRepo.save(assignment);

    await this.auditService.logEvent(
      AuditEventType.STUDENT_ASSIGNED,
      { examId, studentId, collegeId: student.collegeId },
      actorId,
    );
    return saved;
  }

  async unassignStudent(examId: string, studentId: string, actorId: string): Promise<void> {
    const existing = await this.assignmentRepo.findOne({ where: { examId, studentId } });
    if (!existing) throw new NotFoundException('Student is not assigned to this exam');

    await this.assignmentRepo.remove(existing);
    await this.auditService.logEvent(
      AuditEventType.STUDENT_UNASSIGNED,
      { examId, studentId },
      actorId,
    );
  }
}
