// Owner: Person A (Platform, Courses, Publish, Results)
//
// ExamRegistration is the single answer to "who may sit this exam". Rows
// come from two places: assigning a course to the exam (every enrolled
// student, source COURSE) and adding a student by hand (source MANUAL).
// Course changes after the fact — enrolling a student, removing a course —
// keep registrations in step. If the exam is already published, newly
// registered students get the same notification everyone else did.

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AuditEventType,
  NotificationType,
  RegistrationSource,
} from '@secure-exam/types';
import type {
  AssignExamToCourseResponse,
  ExamCourse,
  ExamRegistration,
  ExamRegistrationWithStudent,
} from '@secure-exam/types';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ExamEntity } from '../exam/entities/exam.entity';
import { NotificationService } from '../notification/notification.service';
import { StudentEntity } from '../user/entities/student.entity';
import { toStudentSummary, UserService } from '../user/user.service';
import { CourseEnrollmentEntity } from './entities/course-enrollment.entity';
import { CourseEntity } from './entities/course.entity';
import { ExamCourseEntity } from './entities/exam-course.entity';
import { ExamRegistrationEntity } from './entities/exam-registration.entity';

export interface ManualRegistrationResult {
  registeredCount: number;
  alreadyRegistered: string[];
  notFound: string[];
}

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(ExamRegistrationEntity)
    private readonly registrationRepo: Repository<ExamRegistrationEntity>,
    @InjectRepository(ExamCourseEntity)
    private readonly examCourseRepo: Repository<ExamCourseEntity>,
    @InjectRepository(CourseEnrollmentEntity)
    private readonly enrollmentRepo: Repository<CourseEnrollmentEntity>,
    @InjectRepository(CourseEntity)
    private readonly courseRepo: Repository<CourseEntity>,
    @InjectRepository(ExamEntity)
    private readonly examRepo: Repository<ExamEntity>,
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async listForExam(examId: string): Promise<ExamRegistrationWithStudent[]> {
    await this.getExamOrThrow(examId);
    const registrations = await this.registrationRepo.find({
      where: { examId },
      order: { registeredAt: 'ASC' },
    });
    const students = await this.userService.findStudentsByIds(registrations.map((r) => r.studentId));
    const byId = new Map(students.map((s) => [s.id, s]));

    return registrations
      .filter((r) => byId.has(r.studentId))
      .map((r) => ({ ...toRegistrationDto(r), student: toStudentSummary(byId.get(r.studentId)!) }))
      .sort((a, b) => a.student.collegeId.localeCompare(b.student.collegeId));
  }

  countForExam(examId: string): Promise<number> {
    return this.registrationRepo.count({ where: { examId } });
  }

  /** Registration counts keyed by exam id, for list screens. */
  async countsByExam(examIds: string[]): Promise<Map<string, number>> {
    if (examIds.length === 0) return new Map();
    const rows: { examId: string; count: string }[] = await this.registrationRepo
      .createQueryBuilder('r')
      .select('r.examId', 'examId')
      .addSelect('COUNT(*)', 'count')
      .where('r.examId IN (:...examIds)', { examIds })
      .groupBy('r.examId')
      .getRawMany();
    return new Map(rows.map((row) => [row.examId, Number(row.count)]));
  }

  /** `userId` is the JWT sub (users.id). */
  async isUserRegistered(examId: string, userId: string): Promise<boolean> {
    const count = await this.registrationRepo
      .createQueryBuilder('r')
      .innerJoin(StudentEntity, 's', 's.id = r.studentId')
      .where('r.examId = :examId', { examId })
      .andWhere('s.userId = :userId', { userId })
      .getCount();
    return count > 0;
  }

  /** users.id of every registered student, for notifications. */
  async registeredUserIds(examId: string): Promise<string[]> {
    const rows: { userId: string }[] = await this.registrationRepo
      .createQueryBuilder('r')
      .innerJoin(StudentEntity, 's', 's.id = r.studentId')
      .select('s.userId', 'userId')
      .where('r.examId = :examId', { examId })
      .getRawMany();
    return rows.map((row) => row.userId);
  }

  /** Exams a user (users.id) is registered for. */
  async examIdsForUser(userId: string): Promise<string[]> {
    const rows: { examId: string }[] = await this.registrationRepo
      .createQueryBuilder('r')
      .innerJoin(StudentEntity, 's', 's.id = r.studentId')
      .select('r.examId', 'examId')
      .where('s.userId = :userId', { userId })
      .getRawMany();
    return rows.map((row) => row.examId);
  }

  async listCoursesForExam(examId: string): Promise<(ExamCourse & { course: { id: string; code: string; name: string }; enrolledCount: number })[]> {
    await this.getExamOrThrow(examId);
    const links = await this.examCourseRepo.find({ where: { examId }, order: { createdAt: 'ASC' } });
    if (links.length === 0) return [];

    const courseIds = links.map((l) => l.courseId);
    const courses = await this.courseRepo.find({ where: { id: In(courseIds) } });
    const counts: { courseId: string; count: string }[] = await this.enrollmentRepo
      .createQueryBuilder('e')
      .select('e.courseId', 'courseId')
      .addSelect('COUNT(*)', 'count')
      .where('e.courseId IN (:...courseIds)', { courseIds })
      .groupBy('e.courseId')
      .getRawMany();
    const countBy = new Map(counts.map((c) => [c.courseId, Number(c.count)]));
    const courseBy = new Map(courses.map((c) => [c.id, c]));

    return links
      .filter((l) => courseBy.has(l.courseId))
      .map((l) => {
        const course = courseBy.get(l.courseId)!;
        return {
          ...toExamCourseDto(l),
          course: { id: course.id, code: course.code, name: course.name },
          enrolledCount: countBy.get(l.courseId) ?? 0,
        };
      });
  }

  // ---------------------------------------------------------------------
  // Manual registration
  // ---------------------------------------------------------------------

  async registerStudents(examId: string, identifiers: string[], actorId: string): Promise<ManualRegistrationResult> {
    const exam = await this.getExamOrThrow(examId);
    const { found, notFound } = await this.userService.resolveStudents(identifiers);

    const studentIds = [...new Set([...found.values()].map((s) => s.id))];
    const inserted = await this.insertRegistrations(
      studentIds.map((studentId) => ({ examId, studentId, source: RegistrationSource.MANUAL, courseId: null })),
    );
    const insertedSet = new Set(inserted.map((r) => r.studentId));
    const alreadyRegistered = [...found.entries()]
      .filter(([, student]) => !insertedSet.has(student.id))
      .map(([identifier]) => identifier);

    if (inserted.length > 0) {
      for (const studentId of insertedSet) {
        const student = [...found.values()].find((s) => s.id === studentId)!;
        await this.auditService.logEvent(
          AuditEventType.STUDENT_ASSIGNED,
          { examId, studentId, collegeId: student.collegeId },
          actorId,
        );
      }
      await this.notifyIfPublished(exam, [...insertedSet]);
    }

    return { registeredCount: inserted.length, alreadyRegistered, notFound };
  }

  /** Removes one student's registration. `studentId` may be a students.id or a users.id. */
  async unregisterStudent(examId: string, studentId: string, actorId: string): Promise<void> {
    const { found } = await this.userService.resolveStudents([studentId]);
    const student = found.get(studentId);
    const registration = student
      ? await this.registrationRepo.findOne({ where: { examId, studentId: student.id } })
      : null;
    if (!registration) throw new NotFoundException('Student is not registered for this exam');

    await this.registrationRepo.remove(registration);
    await this.auditService.logEvent(AuditEventType.STUDENT_UNASSIGNED, { examId, studentId: registration.studentId }, actorId);
  }

  // ---------------------------------------------------------------------
  // Course <-> exam
  // ---------------------------------------------------------------------

  async assignCourse(examId: string, courseId: string, actorId: string): Promise<AssignExamToCourseResponse> {
    const exam = await this.getExamOrThrow(examId);
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const existing = await this.examCourseRepo.findOne({ where: { examId, courseId } });
    if (existing) throw new ConflictException(`Course ${course.code} is already assigned to this exam`);

    const link = await this.examCourseRepo.save(this.examCourseRepo.create({ examId, courseId }));

    const enrollments = await this.enrollmentRepo.find({ where: { courseId } });
    const inserted = await this.insertRegistrations(
      enrollments.map((e) => ({ examId, studentId: e.studentId, source: RegistrationSource.COURSE, courseId })),
    );
    await this.notifyIfPublished(exam, inserted.map((r) => r.studentId));

    await this.auditService.logEvent(
      AuditEventType.EXAM_COURSE_ASSIGNED,
      { examId, courseId, courseCode: course.code, registrationsCreated: inserted.length },
      actorId,
    );

    return { examCourse: toExamCourseDto(link), registrationsCreated: inserted.length };
  }

  /**
   * Unlinks a course. Registrations it created are re-pointed at another
   * assigned course that still covers the student, or removed. MANUAL
   * registrations are never touched.
   */
  async unassignCourse(examId: string, courseId: string, actorId: string): Promise<{ registrationsRemoved: number }> {
    const link = await this.examCourseRepo.findOne({ where: { examId, courseId } });
    if (!link) throw new NotFoundException('Course is not assigned to this exam');
    await this.examCourseRepo.remove(link);

    const affected = await this.registrationRepo.find({
      where: { examId, source: RegistrationSource.COURSE, courseId },
    });
    const removed = await this.reconcileCourseRegistrations(affected);

    await this.auditService.logEvent(
      AuditEventType.EXAM_COURSE_UNASSIGNED,
      { examId, courseId, registrationsRemoved: removed },
      actorId,
    );
    return { registrationsRemoved: removed };
  }

  /** Called after students are enrolled in a course: registers them for its exams. */
  async expandCourseEnrollments(courseId: string, studentIds: string[]): Promise<number> {
    if (studentIds.length === 0) return 0;
    const links = await this.examCourseRepo.find({ where: { courseId } });
    let created = 0;
    for (const link of links) {
      const inserted = await this.insertRegistrations(
        studentIds.map((studentId) => ({
          examId: link.examId,
          studentId,
          source: RegistrationSource.COURSE,
          courseId,
        })),
      );
      created += inserted.length;
      if (inserted.length > 0) {
        const exam = await this.examRepo.findOne({ where: { id: link.examId } });
        if (exam) await this.notifyIfPublished(exam, inserted.map((r) => r.studentId));
      }
    }
    return created;
  }

  /** Called after a student leaves a course: drops (or re-points) what the course gave them. */
  async contractCourseEnrollment(courseId: string, studentId: string): Promise<number> {
    const affected = await this.registrationRepo.find({
      where: { studentId, source: RegistrationSource.COURSE, courseId },
    });
    return this.reconcileCourseRegistrations(affected);
  }

  /** Called before a course is deleted: same as unassigning it from every exam. */
  async releaseCourse(courseId: string): Promise<number> {
    await this.examCourseRepo.delete({ courseId });
    const affected = await this.registrationRepo.find({ where: { source: RegistrationSource.COURSE, courseId } });
    return this.reconcileCourseRegistrations(affected);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /**
   * For each COURSE registration whose course no longer applies, keep it if
   * another course assigned to the same exam still has the student enrolled
   * (re-pointing courseId), otherwise delete it. Returns how many were deleted.
   */
  private async reconcileCourseRegistrations(registrations: ExamRegistrationEntity[]): Promise<number> {
    let removed = 0;
    for (const registration of registrations) {
      const replacement: { courseId: string } | undefined = await this.examCourseRepo
        .createQueryBuilder('ec')
        .innerJoin(CourseEnrollmentEntity, 'e', 'e.courseId = ec.courseId AND e.studentId = :studentId', {
          studentId: registration.studentId,
        })
        .select('ec.courseId', 'courseId')
        .where('ec.examId = :examId', { examId: registration.examId })
        .andWhere('ec.courseId != :courseId', { courseId: registration.courseId })
        .getRawOne();

      if (replacement) {
        await this.registrationRepo.update({ id: registration.id }, { courseId: replacement.courseId });
      } else {
        await this.registrationRepo.delete({ id: registration.id });
        removed++;
      }
    }
    return removed;
  }

  /** INSERT ... ON CONFLICT DO NOTHING; returns only the rows actually created. */
  private async insertRegistrations(
    rows: Pick<ExamRegistrationEntity, 'examId' | 'studentId' | 'source' | 'courseId'>[],
  ): Promise<{ id: string; studentId: string }[]> {
    if (rows.length === 0) return [];
    const result = await this.registrationRepo
      .createQueryBuilder()
      .insert()
      .into(ExamRegistrationEntity)
      .values(rows)
      .orIgnore()
      .returning(['id', 'studentId'])
      .execute();
    return (result.raw as { id: string; studentId: string }[]) ?? [];
  }

  private async notifyIfPublished(exam: ExamEntity, studentIds: string[]): Promise<void> {
    if (!exam.publishedAt || studentIds.length === 0) return;
    const students = await this.userService.findStudentsByIds(studentIds);
    await this.notificationService.notifyMany(
      students.map((s) => s.userId),
      examPublishedNotification(exam),
    );
  }

  private async getExamOrThrow(examId: string): Promise<ExamEntity> {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException(`Exam ${examId} not found`);
    return exam;
  }
}

/** The notification a registered student receives when an exam is published to them. */
export function examPublishedNotification(exam: ExamEntity, message?: string) {
  const starts = exam.startTime.toISOString();
  return {
    type: NotificationType.EXAM_PUBLISHED,
    title: `New exam: ${exam.title}`,
    body:
      `You are registered for "${exam.title}" (${exam.durationMinutes} min). ` +
      `It opens at ${starts}.` +
      (message ? ` ${message}` : ''),
    data: { examId: exam.id, startTime: starts },
  };
}

export function toRegistrationDto(entity: ExamRegistrationEntity): ExamRegistration {
  return {
    id: entity.id,
    examId: entity.examId,
    studentId: entity.studentId,
    source: entity.source,
    courseId: entity.courseId,
    registeredAt: entity.registeredAt.toISOString(),
  };
}

export function toExamCourseDto(entity: ExamCourseEntity): ExamCourse {
  return {
    id: entity.id,
    examId: entity.examId,
    courseId: entity.courseId,
    createdAt: entity.createdAt.toISOString(),
  };
}
