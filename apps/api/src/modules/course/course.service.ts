// Owner: Person A (Platform, Courses, Publish, Results)

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditEventType } from '@secure-exam/types';
import type {
  Course,
  CourseEnrollmentWithStudent,
  CourseWithCounts,
  EnrollStudentsResponse,
} from '@secure-exam/types';
import { CreateCourseDto, UpdateCourseDto } from '@secure-exam/validation';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { toStudentSummary, UserService } from '../user/user.service';
import { CourseEnrollmentEntity } from './entities/course-enrollment.entity';
import { CourseEntity } from './entities/course.entity';
import { ExamCourseEntity } from './entities/exam-course.entity';
import { RegistrationService } from './registration.service';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courseRepo: Repository<CourseEntity>,
    @InjectRepository(CourseEnrollmentEntity)
    private readonly enrollmentRepo: Repository<CourseEnrollmentEntity>,
    @InjectRepository(ExamCourseEntity)
    private readonly examCourseRepo: Repository<ExamCourseEntity>,
    private readonly registrationService: RegistrationService,
    private readonly userService: UserService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<CourseWithCounts[]> {
    const courses = await this.courseRepo.find({ order: { code: 'ASC' } });
    return this.withCounts(courses);
  }

  async findOne(id: string): Promise<CourseWithCounts> {
    const [course] = await this.withCounts([await this.getOrThrow(id)]);
    return course;
  }

  async create(dto: CreateCourseDto, actorId: string): Promise<Course> {
    const code = dto.code.trim().toUpperCase();
    await this.assertCodeFree(code);
    const saved = await this.courseRepo.save(
      this.courseRepo.create({ code, name: dto.name.trim(), description: dto.description?.trim() || null }),
    );
    await this.auditService.logEvent(AuditEventType.COURSE_CREATED, { courseId: saved.id, code }, actorId);
    return toCourseDto(saved);
  }

  async update(id: string, dto: UpdateCourseDto, actorId: string): Promise<Course> {
    const course = await this.getOrThrow(id);
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      if (code !== course.code) await this.assertCodeFree(code);
      course.code = code;
    }
    if (dto.name !== undefined) course.name = dto.name.trim();
    if (dto.description !== undefined) course.description = dto.description.trim() || null;

    const saved = await this.courseRepo.save(course);
    await this.auditService.logEvent(AuditEventType.COURSE_UPDATED, { courseId: id, changes: dto }, actorId);
    return toCourseDto(saved);
  }

  /** Deleting a course unassigns it from its exams first (registrations follow). */
  async remove(id: string, actorId: string): Promise<void> {
    const course = await this.getOrThrow(id);
    const registrationsRemoved = await this.registrationService.releaseCourse(id);
    await this.enrollmentRepo.delete({ courseId: id });
    await this.courseRepo.remove(course);
    await this.auditService.logEvent(
      AuditEventType.COURSE_DELETED,
      { courseId: id, code: course.code, registrationsRemoved },
      actorId,
    );
  }

  // ---------------------------------------------------------------------
  // Enrollment
  // ---------------------------------------------------------------------

  async listEnrollments(courseId: string): Promise<CourseEnrollmentWithStudent[]> {
    await this.getOrThrow(courseId);
    const enrollments = await this.enrollmentRepo.find({ where: { courseId } });
    const students = await this.userService.findStudentsByIds(enrollments.map((e) => e.studentId));
    const byId = new Map(students.map((s) => [s.id, s]));

    return enrollments
      .filter((e) => byId.has(e.studentId))
      .map((e) => ({
        id: e.id,
        courseId: e.courseId,
        studentId: e.studentId,
        enrolledAt: e.enrolledAt.toISOString(),
        student: toStudentSummary(byId.get(e.studentId)!),
      }))
      .sort((a, b) => a.student.collegeId.localeCompare(b.student.collegeId));
  }

  async enroll(courseId: string, identifiers: string[], actorId: string): Promise<EnrollStudentsResponse> {
    const course = await this.getOrThrow(courseId);
    const { found, notFound } = await this.userService.resolveStudents(identifiers);
    const studentIds = [...new Set([...found.values()].map((s) => s.id))];

    let insertedIds: string[] = [];
    if (studentIds.length > 0) {
      const result = await this.enrollmentRepo
        .createQueryBuilder()
        .insert()
        .into(CourseEnrollmentEntity)
        .values(studentIds.map((studentId) => ({ courseId, studentId })))
        .orIgnore()
        .returning(['studentId'])
        .execute();
      insertedIds = ((result.raw as { studentId: string }[]) ?? []).map((r) => r.studentId);
    }

    const insertedSet = new Set(insertedIds);
    const alreadyEnrolled = [...found.entries()]
      .filter(([, student]) => !insertedSet.has(student.id))
      .map(([identifier]) => identifier);

    const registrationsCreated = await this.registrationService.expandCourseEnrollments(courseId, insertedIds);

    if (insertedIds.length > 0) {
      await this.auditService.logEvent(
        AuditEventType.COURSE_STUDENTS_ENROLLED,
        { courseId, code: course.code, enrolledCount: insertedIds.length, registrationsCreated },
        actorId,
      );
    }

    return { enrolledCount: insertedIds.length, alreadyEnrolled, notFound, registrationsCreated };
  }

  /** `studentId` may be a students.id, users.id or college ID. */
  async unenroll(courseId: string, studentId: string, actorId: string): Promise<{ registrationsRemoved: number }> {
    await this.getOrThrow(courseId);
    const { found } = await this.userService.resolveStudents([studentId]);
    const student = found.get(studentId);
    const enrollment = student
      ? await this.enrollmentRepo.findOne({ where: { courseId, studentId: student.id } })
      : null;
    if (!enrollment) throw new NotFoundException('Student is not enrolled in this course');

    await this.enrollmentRepo.remove(enrollment);
    const registrationsRemoved = await this.registrationService.contractCourseEnrollment(courseId, enrollment.studentId);

    await this.auditService.logEvent(
      AuditEventType.COURSE_STUDENT_UNENROLLED,
      { courseId, studentId: enrollment.studentId, registrationsRemoved },
      actorId,
    );
    return { registrationsRemoved };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async withCounts(courses: CourseEntity[]): Promise<CourseWithCounts[]> {
    if (courses.length === 0) return [];
    const ids = courses.map((c) => c.id);
    const [enrolled, exams] = await Promise.all([
      this.countBy(this.enrollmentRepo, ids),
      this.countBy(this.examCourseRepo, ids),
    ]);
    return courses.map((c) => ({
      ...toCourseDto(c),
      enrolledCount: enrolled.get(c.id) ?? 0,
      examCount: exams.get(c.id) ?? 0,
    }));
  }

  private async countBy(
    repo: Repository<CourseEnrollmentEntity> | Repository<ExamCourseEntity>,
    courseIds: string[],
  ): Promise<Map<string, number>> {
    const rows: { courseId: string; count: string }[] = await (repo as Repository<CourseEnrollmentEntity>)
      .createQueryBuilder('x')
      .select('x.courseId', 'courseId')
      .addSelect('COUNT(*)', 'count')
      .where('x.courseId IN (:...courseIds)', { courseIds })
      .groupBy('x.courseId')
      .getRawMany();
    return new Map(rows.map((r) => [r.courseId, Number(r.count)]));
  }

  private async assertCodeFree(code: string): Promise<void> {
    const clash = await this.courseRepo.findOne({ where: { code } });
    if (clash) throw new ConflictException(`A course with code ${code} already exists`);
  }

  private async getOrThrow(id: string): Promise<CourseEntity> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }
}

export function toCourseDto(entity: CourseEntity): Course {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    description: entity.description,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
