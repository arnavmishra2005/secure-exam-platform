import { ConflictException } from '@nestjs/common';
import { RegistrationSource } from '@secure-exam/types';
import { RegistrationService } from './registration.service';

function qbReturning(raw: unknown) {
  const qb: any = {};
  for (const m of ['insert', 'into', 'values', 'orIgnore', 'returning', 'innerJoin', 'select', 'where', 'andWhere']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.execute = jest.fn().mockResolvedValue({ raw });
  qb.getRawOne = jest.fn().mockResolvedValue(raw);
  return qb;
}

describe('RegistrationService', () => {
  let registrationRepo: any;
  let examCourseRepo: any;
  let enrollmentRepo: any;
  let courseRepo: any;
  let examRepo: any;
  let userService: any;
  let notificationService: any;
  let auditService: any;
  let service: RegistrationService;
  const exam = { id: 'exam-1', title: 'OS', durationMinutes: 60, startTime: new Date('2026-06-01T09:00:00Z'), publishedAt: null as Date | null };

  beforeEach(() => {
    registrationRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn(),
    };
    examCourseRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (x: any) => ({ id: 'ec-1', createdAt: new Date(), ...x })),
      create: jest.fn((x: any) => x),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    enrollmentRepo = { find: jest.fn().mockResolvedValue([]) };
    courseRepo = { findOne: jest.fn().mockResolvedValue({ id: 'course-1', code: 'CS101' }) };
    examRepo = { findOne: jest.fn(async () => exam) };
    userService = {
      findStudentsByIds: jest.fn(async (ids: string[]) => ids.map((id) => ({ id, userId: `user-of-${id}` }))),
      resolveStudents: jest.fn(),
    };
    notificationService = { notifyMany: jest.fn() };
    auditService = { logEvent: jest.fn() };
    service = new RegistrationService(
      registrationRepo,
      examCourseRepo,
      enrollmentRepo,
      courseRepo,
      examRepo,
      userService,
      notificationService,
      auditService,
    );
    exam.publishedAt = null;
  });

  describe('assignCourse', () => {
    it('registers every enrolled student and reports only newly created rows', async () => {
      enrollmentRepo.find.mockResolvedValue([{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }]);
      const insertQb = qbReturning([{ id: 'r1', studentId: 's1' }, { id: 'r3', studentId: 's3' }]); // s2 was already registered
      registrationRepo.createQueryBuilder.mockReturnValue(insertQb);

      const result = await service.assignCourse('exam-1', 'course-1', 'admin-1');

      expect(result.registrationsCreated).toBe(2);
      expect(insertQb.values).toHaveBeenCalledWith([
        { examId: 'exam-1', studentId: 's1', source: RegistrationSource.COURSE, courseId: 'course-1' },
        { examId: 'exam-1', studentId: 's2', source: RegistrationSource.COURSE, courseId: 'course-1' },
        { examId: 'exam-1', studentId: 's3', source: RegistrationSource.COURSE, courseId: 'course-1' },
      ]);
      expect(insertQb.orIgnore).toHaveBeenCalled();
      // Unpublished exam: nobody is notified yet.
      expect(notificationService.notifyMany).not.toHaveBeenCalled();
    });

    it('notifies newly registered students when the exam is already published', async () => {
      exam.publishedAt = new Date();
      enrollmentRepo.find.mockResolvedValue([{ studentId: 's1' }]);
      registrationRepo.createQueryBuilder.mockReturnValue(qbReturning([{ id: 'r1', studentId: 's1' }]));

      await service.assignCourse('exam-1', 'course-1', 'admin-1');

      expect(notificationService.notifyMany).toHaveBeenCalledWith(['user-of-s1'], expect.anything());
    });

    it('rejects assigning the same course twice', async () => {
      examCourseRepo.findOne.mockResolvedValue({ id: 'ec-1' });
      await expect(service.assignCourse('exam-1', 'course-1', 'admin-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('unassignCourse', () => {
    it('re-points a registration still covered by another course and deletes the rest', async () => {
      examCourseRepo.findOne.mockResolvedValue({ id: 'ec-1', examId: 'exam-1', courseId: 'course-1' });
      registrationRepo.find.mockResolvedValue([
        { id: 'r1', examId: 'exam-1', studentId: 's1', courseId: 'course-1' },
        { id: 'r2', examId: 'exam-1', studentId: 's2', courseId: 'course-1' },
      ]);
      examCourseRepo.createQueryBuilder
        .mockReturnValueOnce(qbReturning({ courseId: 'course-2' })) // s1 is also in course-2
        .mockReturnValueOnce(qbReturning(undefined)); // s2 isn't covered by anything else

      const result = await service.unassignCourse('exam-1', 'course-1', 'admin-1');

      expect(registrationRepo.update).toHaveBeenCalledWith({ id: 'r1' }, { courseId: 'course-2' });
      expect(registrationRepo.delete).toHaveBeenCalledWith({ id: 'r2' });
      expect(result.registrationsRemoved).toBe(1);
    });

    it('only considers COURSE registrations from that course (MANUAL ones are left alone)', async () => {
      examCourseRepo.findOne.mockResolvedValue({ id: 'ec-1', examId: 'exam-1', courseId: 'course-1' });

      await service.unassignCourse('exam-1', 'course-1', 'admin-1');

      expect(registrationRepo.find).toHaveBeenCalledWith({
        where: { examId: 'exam-1', source: RegistrationSource.COURSE, courseId: 'course-1' },
      });
    });
  });
});
