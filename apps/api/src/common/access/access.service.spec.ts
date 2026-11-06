// Who may do what: instructors everything on their courses, TAs only what was
// granted, everyone else nothing (and other courses' records look missing).

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ALL_PERMISSIONS, CourseStaffRole, Permission, Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import type { DataSource } from 'typeorm';
import { AccessService } from './access.service';

const COURSE_A = '11111111-1111-4111-8111-111111111111';
const COURSE_B = '22222222-2222-4222-8222-222222222222';
const EXAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const QUESTION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type StaffRow = { courseId: string; role: CourseStaffRole; permissions: Permission[] };

/** A fake DataSource answering the handful of queries AccessService makes. */
function setup(staff: Record<string, StaffRow[]>, extra: { examCourses?: Record<string, string | null>; instructorsOf?: Record<string, string[]>; questionOwners?: Record<string, string> } = {}) {
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM "course_staff" WHERE "userId"')) return staff[params[0] as string] ?? [];
    if (sql.includes('FROM "exams" WHERE "id"')) {
      const courseId = extra.examCourses?.[params[0] as string];
      return courseId === undefined ? [] : [{ v: courseId }];
    }
    if (sql.includes('SELECT DISTINCT "userId" FROM "course_staff"')) {
      return (params[0] as string[]).flatMap((c) => (extra.instructorsOf?.[c] ?? []).map((userId) => ({ userId })));
    }
    if (sql.includes('FROM "course_staff" WHERE "courseId" = $1 AND "role" = \'INSTRUCTOR\'')) {
      return (extra.instructorsOf?.[params[0] as string] ?? []).slice(0, 1).map((userId) => ({ userId }));
    }
    if (sql.includes('FROM "questions"')) {
      const owner = extra.questionOwners?.[params[0] as string];
      return owner ? [{ v: owner }] : [];
    }
    if (sql.includes('FROM "exams" WHERE "course_id" = ANY')) {
      return Object.entries(extra.examCourses ?? {})
        .filter(([, c]) => c && (params[0] as string[]).includes(c))
        .map(([id]) => ({ id }));
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  return { service: new AccessService({ query } as unknown as DataSource), query };
}

const instructor: JwtPayload = { sub: 'inst-1', email: 'i@x', role: Role.INSTRUCTOR };
const ta: JwtPayload = { sub: 'ta-1', email: 't@x', role: Role.TA };
const student: JwtPayload = { sub: 'stu-1', email: 's@x', role: Role.STUDENT };

describe('AccessService', () => {
  it('gives an instructor every permission on their course, and nothing elsewhere', async () => {
    const { service } = setup({ 'inst-1': [{ courseId: COURSE_A, role: CourseStaffRole.INSTRUCTOR, permissions: [] }] });
    for (const p of ALL_PERMISSIONS) await expect(service.can(instructor, COURSE_A, p)).resolves.toBe(true);
    await expect(service.can(instructor, COURSE_B)).resolves.toBe(false);
    await expect(service.courseIdsFor(instructor, Permission.RESULTS_PUBLISH)).resolves.toEqual([COURSE_A]);
  });

  it('gives a TA only the permissions granted on each course', async () => {
    const { service } = setup({
      'ta-1': [
        { courseId: COURSE_A, role: CourseStaffRole.TA, permissions: [Permission.MONITOR] },
        { courseId: COURSE_B, role: CourseStaffRole.TA, permissions: [Permission.MONITOR, Permission.MARKS_ADJUST] },
      ],
    });
    await expect(service.can(ta, COURSE_A, Permission.MONITOR)).resolves.toBe(true);
    await expect(service.can(ta, COURSE_A, Permission.MARKS_ADJUST)).resolves.toBe(false);
    await expect(service.courseIdsFor(ta, Permission.MARKS_ADJUST)).resolves.toEqual([COURSE_B]);
    await expect(service.courseIdsFor(ta)).resolves.toEqual([COURSE_A, COURSE_B]);
    await expect(service.hasAnywhere(ta, Permission.RESULTS_PUBLISH)).resolves.toBe(false);
  });

  it('ignores unknown permission strings stored for a TA', async () => {
    const { service } = setup({
      'ta-1': [{ courseId: COURSE_A, role: CourseStaffRole.TA, permissions: ['EVERYTHING' as Permission] }],
    });
    await expect(service.courseIdsFor(ta, 'EVERYTHING' as Permission)).resolves.toEqual([]);
  });

  it('gives a student no staff access and never queries course_staff for them', async () => {
    const { service, query } = setup({});
    await expect(service.courseIdsFor(student)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('looks the user up once per request (per JwtPayload object)', async () => {
    const { service, query } = setup({ 'inst-1': [{ courseId: COURSE_A, role: CourseStaffRole.INSTRUCTOR, permissions: [] }] });
    await service.can(instructor, COURSE_A);
    await service.courseIdsFor(instructor);
    expect(query).toHaveBeenCalledTimes(1);
    await service.can({ ...instructor }, COURSE_A);
    expect(query).toHaveBeenCalledTimes(2);
  });

  describe('assertions', () => {
    const staff = {
      'ta-1': [{ courseId: COURSE_A, role: CourseStaffRole.TA, permissions: [Permission.EXAM_VIEW] }],
    };

    it("answers 404 for another course's exam and 403 for a missing permission on your own", async () => {
      const { service } = setup(staff, { examCourses: { [EXAM_A]: COURSE_A, [EXAM_B]: COURSE_B } });
      await expect(service.assertExam(ta, EXAM_A, Permission.EXAM_VIEW)).resolves.toBe(COURSE_A);
      await expect(service.assertExam(ta, EXAM_A, Permission.EXAM_EDIT)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.assertExam(ta, EXAM_B, Permission.EXAM_VIEW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers 404 for an exam with no course, a missing exam, or a malformed id', async () => {
      const { service, query } = setup(staff, { examCourses: { [EXAM_A]: null } });
      await expect(service.assertExam(ta, EXAM_A)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.assertExam(ta, EXAM_B)).rejects.toBeInstanceOf(NotFoundException);
      query.mockClear();
      await expect(service.assertResource(ta, 'exam', 'not-a-uuid', undefined)).rejects.toBeInstanceOf(NotFoundException);
      expect(query).not.toHaveBeenCalled();
    });

    it('lets only instructors through an instructor-only course check', async () => {
      const { service } = setup({
        ...staff,
        'inst-1': [{ courseId: COURSE_A, role: CourseStaffRole.INSTRUCTOR, permissions: [] }],
      });
      await expect(service.assertCourse(instructor, COURSE_A, undefined, true)).resolves.toBeUndefined();
      await expect(service.assertCourse(ta, COURSE_A, undefined, true)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.assertCourse(ta, COURSE_B)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('question banks', () => {
    const staff = {
      'inst-1': [{ courseId: COURSE_A, role: CourseStaffRole.INSTRUCTOR, permissions: [] }],
      'ta-1': [
        { courseId: COURSE_A, role: CourseStaffRole.TA, permissions: [Permission.QUESTION_BANK_VIEW] },
        { courseId: COURSE_B, role: CourseStaffRole.TA, permissions: [Permission.QUESTION_BANK_VIEW, Permission.QUESTION_BANK_EDIT] },
      ],
    };
    const instructorsOf = { [COURSE_A]: ['inst-1'], [COURSE_B]: ['inst-2'] };

    it("is the instructor's own bank, plus their instructors' banks for a TA", async () => {
      const { service } = setup(staff, { instructorsOf });
      await expect(service.bankOwnerIdsFor(instructor, Permission.QUESTION_BANK_EDIT)).resolves.toEqual(['inst-1']);
      await expect(service.bankOwnerIdsFor(ta, Permission.QUESTION_BANK_VIEW)).resolves.toEqual(['inst-1', 'inst-2']);
      await expect(service.bankOwnerIdsFor(ta, Permission.QUESTION_BANK_EDIT)).resolves.toEqual(['inst-2']);
    });

    it('lets a TA view but not edit a bank they only have view access to', async () => {
      const { service } = setup(staff, { instructorsOf, questionOwners: { [QUESTION]: 'inst-1' } });
      await expect(service.assertQuestion(ta, QUESTION, Permission.QUESTION_BANK_VIEW)).resolves.toBeUndefined();
      await expect(service.assertQuestion(ta, QUESTION, Permission.QUESTION_BANK_EDIT)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("hides another instructor's question", async () => {
      const { service } = setup(staff, { instructorsOf, questionOwners: { [QUESTION]: 'inst-9' } });
      await expect(service.assertQuestion(instructor, QUESTION, Permission.QUESTION_BANK_VIEW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('puts new questions in the right bank', async () => {
      const { service } = setup(staff, { instructorsOf });
      await expect(service.resolveBankOwner(instructor)).resolves.toBe('inst-1');
      // The TA may edit only inst-2's bank, so that's where it goes.
      await expect(service.resolveBankOwner(ta)).resolves.toBe('inst-2');
      await expect(service.resolveBankOwner(ta, COURSE_B)).resolves.toBe('inst-2');
      await expect(service.resolveBankOwner(ta, COURSE_A)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('asks a TA who edits several banks to choose a course', async () => {
      const { service } = setup(
        {
          'ta-1': [
            { courseId: COURSE_A, role: CourseStaffRole.TA, permissions: [Permission.QUESTION_BANK_EDIT] },
            { courseId: COURSE_B, role: CourseStaffRole.TA, permissions: [Permission.QUESTION_BANK_EDIT] },
          ],
        },
        { instructorsOf },
      );
      await expect(service.resolveBankOwner(ta)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.resolveBankOwner(ta, COURSE_A)).resolves.toBe('inst-1');
    });
  });

  it('lists exams of the courses a permission covers', async () => {
    const { service } = setup(
      { 'ta-1': [{ courseId: COURSE_A, role: CourseStaffRole.TA, permissions: [Permission.MONITOR] }] },
      { examCourses: { [EXAM_A]: COURSE_A, [EXAM_B]: COURSE_B } },
    );
    await expect(service.examIdsFor(ta, Permission.MONITOR)).resolves.toEqual([EXAM_A]);
    await expect(service.examIdsFor(ta, Permission.RESULTS_VIEW)).resolves.toEqual([]);
  });
});
