// Owner: Person A (Identity/Auth/Security)
// Who may do what, per course. Instructors may do everything on the courses
// they teach; TAs only what an instructor granted them on that course.
// Everything another instructor owns answers 404, so IDs can't be probed.

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ALL_PERMISSIONS, CourseStaffRole, Permission, Role } from '@secure-exam/types';
import type { JwtPayload, MyAccess } from '@secure-exam/types';
import { DataSource } from 'typeorm';

export interface CourseGrant {
  role: CourseStaffRole;
  permissions: ReadonlySet<Permission>;
}

export interface UserAccess {
  userId: string;
  role: Role;
  /** Keyed by courses.id. */
  courses: ReadonlyMap<string, CourseGrant>;
}

/** The kinds of record a route can name in its path. */
export type AccessResourceKind = 'course' | 'exam' | 'attempt' | 'question' | 'topic' | 'student';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND: Record<AccessResourceKind, string> = {
  course: 'Course not found',
  exam: 'Exam not found',
  attempt: 'Attempt not found',
  question: 'Question not found',
  topic: 'Topic not found',
  student: 'Student not found',
};

const ALL = new Set(ALL_PERMISSIONS);

@Injectable()
export class AccessService {
  /**
   * One lookup per request: the guard and the handler get the same JwtPayload
   * object (request.user), so it is the cache key and dies with the request.
   */
  private readonly cache = new WeakMap<object, Promise<UserAccess>>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  forUser(user: JwtPayload): Promise<UserAccess> {
    let access = this.cache.get(user);
    if (!access) {
      access = this.load(user);
      this.cache.set(user, access);
    }
    return access;
  }

  isStaff(user: JwtPayload): boolean {
    return user.role === Role.INSTRUCTOR || user.role === Role.TA;
  }

  /** On this course, may the user do `permission`? Without one: are they on its staff at all? */
  async can(user: JwtPayload, courseId: string, permission?: Permission): Promise<boolean> {
    const grant = (await this.forUser(user)).courses.get(courseId);
    if (!grant) return false;
    return !permission || grant.permissions.has(permission);
  }

  /** May the user do `permission` on at least one course? */
  async hasAnywhere(user: JwtPayload, permission: Permission): Promise<boolean> {
    return (await this.courseIdsFor(user, permission)).length > 0;
  }

  /** Courses where the user may do `permission`; without one, every course they are staff on. */
  async courseIdsFor(user: JwtPayload, permission?: Permission): Promise<string[]> {
    const { courses } = await this.forUser(user);
    return [...courses.entries()]
      .filter(([, grant]) => !permission || grant.permissions.has(permission))
      .map(([courseId]) => courseId);
  }

  /** Exams owned by courses where the user may do `permission`. */
  async examIdsFor(user: JwtPayload, permission: Permission): Promise<string[]> {
    const courseIds = await this.courseIdsFor(user, permission);
    if (courseIds.length === 0) return [];
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT "id" FROM "exams" WHERE "course_id" = ANY($1::uuid[])`,
      [courseIds],
    );
    return rows.map((r) => r.id);
  }

  /**
   * Whose question banks the user may use for `permission`: an instructor's
   * own, plus those of the instructors of every course where they are a TA with
   * that permission. Co-instructors don't see each other's banks.
   */
  async bankOwnerIdsFor(user: JwtPayload, permission: Permission): Promise<string[]> {
    const access = await this.forUser(user);
    const owners = new Set<string>();
    if (access.role === Role.INSTRUCTOR) owners.add(access.userId);
    const assisted = [...access.courses.entries()]
      .filter(([, grant]) => grant.role === CourseStaffRole.TA && grant.permissions.has(permission))
      .map(([courseId]) => courseId);
    if (assisted.length > 0) {
      const rows: { userId: string }[] = await this.dataSource.query(
        `SELECT DISTINCT "userId" FROM "course_staff" WHERE "courseId" = ANY($1::uuid[]) AND "role" = 'INSTRUCTOR'`,
        [assisted],
      );
      for (const row of rows) owners.add(row.userId);
    }
    return [...owners];
  }

  /**
   * The bank a new question or topic goes into. An instructor's own; for a TA,
   * the bank of the course's instructor (`courseId`), or of the only instructor
   * they assist with question-bank editing.
   */
  async resolveBankOwner(user: JwtPayload, courseId?: string | null): Promise<string> {
    if (user.role === Role.INSTRUCTOR) {
      if (courseId) await this.assertCourse(user, courseId, Permission.QUESTION_BANK_EDIT);
      return user.sub;
    }
    if (courseId) {
      await this.assertCourse(user, courseId, Permission.QUESTION_BANK_EDIT);
      const [first]: { userId: string }[] = await this.dataSource.query(
        `SELECT "userId" FROM "course_staff" WHERE "courseId" = $1 AND "role" = 'INSTRUCTOR' ORDER BY "createdAt", "id" LIMIT 1`,
        [courseId],
      );
      if (!first) throw new BadRequestException('This course has no instructor');
      return first.userId;
    }
    const owners = await this.bankOwnerIdsFor(user, Permission.QUESTION_BANK_EDIT);
    if (owners.length === 0) throw new ForbiddenException('You may not edit any question bank');
    if (owners.length > 1) {
      throw new BadRequestException('You assist more than one instructor: choose the course this question belongs to.');
    }
    return owners[0];
  }

  // ---------------------------------------------------------------------
  // Assertions. Not on the course's staff: 404. On it but not allowed: 403.
  // ---------------------------------------------------------------------

  async assertCourse(
    user: JwtPayload,
    courseId: string,
    permission?: Permission,
    instructorOnly = false,
  ): Promise<void> {
    const grant = (await this.forUser(user)).courses.get(courseId);
    if (!grant) throw new NotFoundException(NOT_FOUND.course);
    if (instructorOnly && grant.role !== CourseStaffRole.INSTRUCTOR) {
      throw new ForbiddenException("Only the course's instructors can do this");
    }
    if (permission && !grant.permissions.has(permission)) {
      throw new ForbiddenException('You do not have permission to do this on this course');
    }
  }

  /** Returns the exam's course. */
  async assertExam(user: JwtPayload, examId: string, permission?: Permission): Promise<string> {
    const courseId = UUID_PATTERN.test(examId)
      ? await this.single<string>(`SELECT "course_id" AS v FROM "exams" WHERE "id" = $1`, [examId])
      : null;
    if (!courseId) throw new NotFoundException(NOT_FOUND.exam);
    await this.assertMember(user, courseId, permission, 'exam');
    return courseId;
  }

  async assertAttempt(user: JwtPayload, attemptId: string, permission?: Permission): Promise<void> {
    const courseId = UUID_PATTERN.test(attemptId)
      ? await this.single<string>(
          `SELECT e."course_id" AS v FROM "attempts" a JOIN "exams" e ON e."id" = a."examId" WHERE a."id" = $1`,
          [attemptId],
        )
      : null;
    if (!courseId) throw new NotFoundException(NOT_FOUND.attempt);
    await this.assertMember(user, courseId, permission, 'attempt');
  }

  async assertQuestion(user: JwtPayload, questionId: string, permission: Permission): Promise<void> {
    await this.assertBankItem(user, 'questions', questionId, permission, 'question');
  }

  async assertTopic(user: JwtPayload, topicId: string, permission: Permission): Promise<void> {
    await this.assertBankItem(user, 'topics', topicId, permission, 'topic');
  }

  /** A student (students.id) enrolled in a course where the user may do `permission`. */
  async assertStudent(user: JwtPayload, studentId: string, permission: Permission): Promise<void> {
    const courseIds = await this.courseIdsFor(user, permission);
    const enrolled =
      UUID_PATTERN.test(studentId) && courseIds.length > 0
        ? await this.single<number>(
            `SELECT 1 AS v FROM "course_enrollments" WHERE "studentId" = $1 AND "courseId" = ANY($2::uuid[]) LIMIT 1`,
            [studentId, courseIds],
          )
        : null;
    if (!enrolled) throw new NotFoundException(NOT_FOUND.student);
  }

  /** Used by PermissionGuard for a route's `{ kind: param }` resource. */
  async assertResource(
    user: JwtPayload,
    kind: AccessResourceKind,
    id: string | undefined,
    permission: Permission | undefined,
    instructorOnly = false,
  ): Promise<void> {
    if (!id || !UUID_PATTERN.test(id)) throw new NotFoundException(NOT_FOUND[kind]);
    switch (kind) {
      case 'course':
        return this.assertCourse(user, id, permission, instructorOnly);
      case 'exam':
        await this.assertExam(user, id, permission);
        return;
      case 'attempt':
        return this.assertAttempt(user, id, permission);
      case 'question':
        return this.assertQuestion(user, id, permission ?? Permission.QUESTION_BANK_VIEW);
      case 'topic':
        return this.assertTopic(user, id, permission ?? Permission.QUESTION_BANK_VIEW);
      case 'student':
        return this.assertStudent(user, id, permission ?? Permission.STUDENTS_MANAGE);
    }
  }

  /** GET /me/access */
  async myAccess(user: JwtPayload): Promise<MyAccess> {
    const access = await this.forUser(user);
    const ids = [...access.courses.keys()];
    const courses: { id: string; code: string; name: string }[] = ids.length
      ? await this.dataSource.query(
          `SELECT "id", "code", "name" FROM "courses" WHERE "id" = ANY($1::uuid[]) ORDER BY "code"`,
          [ids],
        )
      : [];
    return {
      userId: access.userId,
      role: access.role,
      courses: courses.map((c) => {
        const grant = access.courses.get(c.id)!;
        return {
          courseId: c.id,
          code: c.code,
          name: c.name,
          role: grant.role,
          permissions: ALL_PERMISSIONS.filter((p) => grant.permissions.has(p)),
        };
      }),
    };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async load(user: JwtPayload): Promise<UserAccess> {
    const courses = new Map<string, CourseGrant>();
    if (this.isStaff(user)) {
      const rows: { courseId: string; role: CourseStaffRole; permissions: Permission[] | null }[] =
        await this.dataSource.query(
          `SELECT "courseId", "role", "permissions" FROM "course_staff" WHERE "userId" = $1`,
          [user.sub],
        );
      for (const row of rows) {
        courses.set(row.courseId, {
          role: row.role,
          permissions:
            row.role === CourseStaffRole.INSTRUCTOR
              ? ALL
              : new Set((row.permissions ?? []).filter((p) => ALL.has(p))),
        });
      }
    }
    return { userId: user.sub, role: user.role, courses };
  }

  private async assertMember(
    user: JwtPayload,
    courseId: string,
    permission: Permission | undefined,
    kind: AccessResourceKind,
  ): Promise<void> {
    const grant = (await this.forUser(user)).courses.get(courseId);
    if (!grant) throw new NotFoundException(NOT_FOUND[kind]);
    if (permission && !grant.permissions.has(permission)) {
      throw new ForbiddenException('You do not have permission to do this on this course');
    }
  }

  private async assertBankItem(
    user: JwtPayload,
    table: 'questions' | 'topics',
    id: string,
    permission: Permission,
    kind: AccessResourceKind,
  ): Promise<void> {
    const ownerId = UUID_PATTERN.test(id)
      ? await this.single<string>(`SELECT "owner_id" AS v FROM "${table}" WHERE "id" = $1`, [id])
      : null;
    if (!ownerId) throw new NotFoundException(NOT_FOUND[kind]);
    if ((await this.bankOwnerIdsFor(user, permission)).includes(ownerId)) return;
    // Visible but not editable: say so; invisible: pretend it doesn't exist.
    if (
      permission === Permission.QUESTION_BANK_EDIT &&
      (await this.bankOwnerIdsFor(user, Permission.QUESTION_BANK_VIEW)).includes(ownerId)
    ) {
      throw new ForbiddenException('You may view this question bank but not edit it');
    }
    throw new NotFoundException(NOT_FOUND[kind]);
  }

  private async single<T>(sql: string, params: unknown[]): Promise<T | null> {
    const rows: { v: T }[] = await this.dataSource.query(sql, params);
    return rows[0]?.v ?? null;
  }
}
