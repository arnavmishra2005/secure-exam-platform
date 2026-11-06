// Owner: Person A (Platform, Courses, Publish, Results)

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ALL_PERMISSIONS, AuditEventType, CourseStaffRole } from '@secure-exam/types';
import type {
  Course,
  CourseEnrollmentWithStudent,
  CourseWithCounts,
  EnrollStudentsResponse,
  JwtPayload,
} from '@secure-exam/types';
import { CreateCourseDto, CreateStudentDto, UpdateCourseDto } from '@secure-exam/validation';
import { In, Repository } from 'typeorm';
import { AccessService } from '../../common/access/access.service';
import { AuditService } from '../audit/audit.service';
import { ExamEntity } from '../exam/entities/exam.entity';
import { StudentEntity } from '../user/entities/student.entity';
import { toStudentSummary, UserService } from '../user/user.service';
import { CourseStaffEntity } from './entities/course-staff.entity';
import { CourseEnrollmentEntity } from './entities/course-enrollment.entity';
import { CourseEntity } from './entities/course.entity';
import { ExamCourseEntity } from './entities/exam-course.entity';
import { RegistrationService } from './registration.service';

export interface ImportStudentsToCourseResult {
  createdCount: number;
  /** Students newly enrolled, whether their account is new or already existed. */
  enrolledCount: number;
  skipped: Array<{ collegeId: string; reason: string }>;
}

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courseRepo: Repository<CourseEntity>,
    @InjectRepository(CourseEnrollmentEntity)
    private readonly enrollmentRepo: Repository<CourseEnrollmentEntity>,
    @InjectRepository(ExamCourseEntity)
    private readonly examCourseRepo: Repository<ExamCourseEntity>,
    @InjectRepository(CourseStaffEntity)
    private readonly staffRepo: Repository<CourseStaffEntity>,
    @InjectRepository(ExamEntity)
    private readonly examRepo: Repository<ExamEntity>,
    private readonly registrationService: RegistrationService,
    private readonly userService: UserService,
    private readonly auditService: AuditService,
    private readonly access: AccessService,
  ) {}

  /** The courses the caller teaches or assists on. */
  async list(user: JwtPayload): Promise<CourseWithCounts[]> {
    const ids = await this.access.courseIdsFor(user);
    if (ids.length === 0) return [];
    const courses = await this.courseRepo.find({ where: { id: In(ids) }, order: { code: 'ASC' } });
    return this.withCounts(courses, user);
  }

  async findOne(id: string, user: JwtPayload): Promise<CourseWithCounts> {
    const [course] = await this.withCounts([await this.getOrThrow(id)], user);
    return course;
  }

  /** The creator becomes the course's first instructor. */
  async create(dto: CreateCourseDto, actorId: string): Promise<Course> {
    const code = dto.code.trim().toUpperCase();
    await this.assertCodeFree(code);
    const saved = await this.courseRepo.manager.transaction(async (manager) => {
      const course = await manager.getRepository(CourseEntity).save(
        manager
          .getRepository(CourseEntity)
          .create({ code, name: dto.name.trim(), description: dto.description?.trim() || null }),
      );
      await manager.getRepository(CourseStaffEntity).insert({
        courseId: course.id,
        userId: actorId,
        role: CourseStaffRole.INSTRUCTOR,
        permissions: [],
        addedBy: null,
      });
      return course;
    });
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

  /**
   * Deleting a course unassigns it from its exams first (registrations follow).
   * A course that owns exams can't be deleted: they would have no staff.
   */
  async remove(id: string, actorId: string): Promise<void> {
    const course = await this.getOrThrow(id);
    const owned = await this.examRepo.count({ where: { courseId: id } });
    if (owned > 0) {
      throw new BadRequestException(
        `This course owns ${owned} exam${owned === 1 ? '' : 's'}. Delete ${owned === 1 ? 'it' : 'them'} first.`,
      );
    }
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

  /** A new student account, enrolled straight into the course. */
  async createStudent(courseId: string, dto: CreateStudentDto, actorId: string): Promise<StudentEntity> {
    await this.getOrThrow(courseId);
    const student = await this.userService.createStudent(dto, actorId);
    await this.enroll(courseId, [student.id], actorId);
    return (await this.userService.findStudentById(student.id))!;
  }

  /**
   * Creates the accounts that don't exist yet, then enrols every listed
   * student in the course. A row whose college ID already exists enrols that
   * student; a row that can't be created (e.g. its email is taken) is skipped.
   */
  async importStudents(courseId: string, rows: CreateStudentDto[], actorId: string): Promise<ImportStudentsToCourseResult> {
    await this.getOrThrow(courseId);
    const studentIds: string[] = [];
    const skipped: ImportStudentsToCourseResult['skipped'] = [];
    let createdCount = 0;

    for (const row of rows) {
      const existing = await this.userService.findByCollegeId(row.collegeId);
      if (existing) {
        studentIds.push(existing.id);
        continue;
      }
      try {
        studentIds.push((await this.userService.createStudent(row, actorId)).id);
        createdCount++;
      } catch (err) {
        skipped.push({ collegeId: row.collegeId, reason: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    const enrolled = studentIds.length ? await this.enroll(courseId, studentIds, actorId) : { enrolledCount: 0 };
    await this.auditService.logEvent(
      AuditEventType.STUDENT_BULK_IMPORTED,
      { courseId, attempted: rows.length, createdCount, enrolledCount: enrolled.enrolledCount, skippedCount: skipped.length },
      actorId,
    );
    return { createdCount, enrolledCount: enrolled.enrolledCount, skipped };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async withCounts(courses: CourseEntity[], user: JwtPayload): Promise<CourseWithCounts[]> {
    if (courses.length === 0) return [];
    const ids = courses.map((c) => c.id);
    const [enrolled, exams, staff, access] = await Promise.all([
      this.countBy(this.enrollmentRepo, ids),
      this.countBy(this.examCourseRepo, ids),
      this.countBy(this.staffRepo, ids),
      this.access.forUser(user),
    ]);
    return courses.map((c) => {
      const grant = access.courses.get(c.id);
      return {
        ...toCourseDto(c),
        enrolledCount: enrolled.get(c.id) ?? 0,
        examCount: exams.get(c.id) ?? 0,
        staffCount: staff.get(c.id) ?? 0,
        myRole: grant?.role ?? CourseStaffRole.TA,
        myPermissions: grant ? ALL_PERMISSIONS.filter((p) => grant.permissions.has(p)) : [],
      };
    });
  }

  private async countBy(
    repo: Repository<CourseEnrollmentEntity> | Repository<ExamCourseEntity> | Repository<CourseStaffEntity>,
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
