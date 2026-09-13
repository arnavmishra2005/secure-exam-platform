import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttemptService } from './attempt.service';
import { TimerService } from './timer.service';
import { AttemptEntity } from './entities/attempt.entity';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { EXAM_LOOKUP_SERVICE, IExamLookupService } from './exam-lookup/exam-lookup.interface';
import { AttemptStatus, Role } from '@secure-exam/types';
// Person A's contract — see attempt.service.ts for the "assumed to exist" note.
import { AuditService } from '../audit/audit.service';

function makeRepoMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) =>
      Promise.resolve({ id: 'attempt-1', createdAt: new Date(), updatedAt: new Date(), ...x }),
    ),
    // Defaults to "the row was found and updated" — tests that care about
    // the affected-row check override this per-call.
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };
}

/** A fake unique-constraint violation shaped like what TypeORM's Postgres driver throws. */
function makeUniqueViolationError(constraint: string) {
  const err: any = new Error(`duplicate key value violates unique constraint "${constraint}"`);
  err.code = '23505';
  err.constraint = constraint;
  return err;
}

describe('AttemptService', () => {
  let service: AttemptService;
  let attemptRepo: ReturnType<typeof makeRepoMock>;
  let sessionRepo: ReturnType<typeof makeRepoMock>;
  let examLookup: jest.Mocked<IExamLookupService>;
  let auditService: { logEvent: jest.Mock };

  const student = { sub: 'student-1', role: Role.STUDENT } as any;
  const otherStudent = { sub: 'student-2', role: Role.STUDENT } as any;
  const admin = { sub: 'admin-1', role: Role.ADMIN } as any;

  const activeExam = {
    id: 'exam-1',
    status: 'ACTIVE' as const,
    startTime: new Date(Date.now() - 5 * 60_000).toISOString(),
    endTime: new Date(Date.now() + 60 * 60_000).toISOString(),
    durationMinutes: 30,
  };

  beforeEach(async () => {
    attemptRepo = makeRepoMock();
    sessionRepo = makeRepoMock();
    examLookup = {
      getExamById: jest.fn(),
      isStudentAssignedToExam: jest.fn(),
    };
    auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptService,
        TimerService,
        { provide: getRepositoryToken(AttemptEntity), useValue: attemptRepo },
        { provide: getRepositoryToken(ExamSessionEntity), useValue: sessionRepo },
        { provide: EXAM_LOOKUP_SERVICE, useValue: examLookup },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(AttemptService);
  });

  describe('startAttempt', () => {
    it('creates an attempt when the student is eligible', async () => {
      examLookup.getExamById.mockResolvedValue(activeExam);
      examLookup.isStudentAssignedToExam.mockResolvedValue(true);
      attemptRepo.findOne.mockResolvedValue(null);

      const result = await service.startAttempt(student, { examId: activeExam.id });

      expect(result.examId).toBe(activeExam.id);
      expect(result.studentId).toBe(student.sub);
      expect(result.status).toBe(AttemptStatus.IN_PROGRESS);
      expect(attemptRepo.save).toHaveBeenCalled();
      expect(sessionRepo.save).toHaveBeenCalled();
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'EXAM_STARTED',
        expect.objectContaining({ examId: activeExam.id }),
        student.sub,
      );
    });

    it('rejects when the exam does not exist', async () => {
      examLookup.getExamById.mockResolvedValue(null);

      await expect(service.startAttempt(student, { examId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('rejects when the exam is not currently active', async () => {
      examLookup.getExamById.mockResolvedValue({ ...activeExam, status: 'CLOSED' });

      await expect(service.startAttempt(student, { examId: activeExam.id })).rejects.toThrow(
        ForbiddenException,
      );
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'SECURITY_CHECK_FAILED',
        expect.objectContaining({ reason: 'EXAM_NOT_ACTIVE' }),
        student.sub,
      );
    });

    it('rejects when the student is not assigned to the exam', async () => {
      examLookup.getExamById.mockResolvedValue(activeExam);
      examLookup.isStudentAssignedToExam.mockResolvedValue(false);

      await expect(service.startAttempt(student, { examId: activeExam.id })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a second attempt at the same exam (fast, unlocked pre-check)', async () => {
      examLookup.getExamById.mockResolvedValue(activeExam);
      examLookup.isStudentAssignedToExam.mockResolvedValue(true);
      attemptRepo.findOne.mockResolvedValue({ id: 'existing-attempt' });

      await expect(service.startAttempt(student, { examId: activeExam.id })).rejects.toThrow(
        ConflictException,
      );
      expect(attemptRepo.save).not.toHaveBeenCalled();
    });

    it('converts a real unique-constraint violation on insert into ConflictException (concurrent race)', async () => {
      // The pre-check passed (findOne returned null) — but another request
      // for the same exam+student committed first, so the INSERT itself
      // now hits UQ_attempts_exam_student.
      examLookup.getExamById.mockResolvedValue(activeExam);
      examLookup.isStudentAssignedToExam.mockResolvedValue(true);
      attemptRepo.findOne.mockResolvedValue(null);
      attemptRepo.save.mockRejectedValueOnce(makeUniqueViolationError('UQ_attempts_exam_student'));

      await expect(service.startAttempt(student, { examId: activeExam.id })).rejects.toThrow(
        ConflictException,
      );
    });

    it('re-throws a DB error that is NOT the exam+student unique violation, unchanged', async () => {
      examLookup.getExamById.mockResolvedValue(activeExam);
      examLookup.isStudentAssignedToExam.mockResolvedValue(true);
      attemptRepo.findOne.mockResolvedValue(null);
      const otherError = new Error('connection reset');
      attemptRepo.save.mockRejectedValueOnce(otherError);

      await expect(service.startAttempt(student, { examId: activeExam.id })).rejects.toThrow(otherError);
    });

    it('still creates the attempt successfully when audit logging fails (best-effort audit)', async () => {
      examLookup.getExamById.mockResolvedValue(activeExam);
      examLookup.isStudentAssignedToExam.mockResolvedValue(true);
      attemptRepo.findOne.mockResolvedValue(null);
      auditService.logEvent.mockRejectedValueOnce(new Error('audit service unreachable'));

      const result = await service.startAttempt(student, { examId: activeExam.id });

      expect(result.status).toBe(AttemptStatus.IN_PROGRESS);
    });
  });

  describe('findOwnedAttemptOrThrow', () => {
    it('returns the attempt for its owner', async () => {
      const attempt = { id: 'attempt-1', studentId: student.sub, examId: 'exam-1' };
      attemptRepo.findOne.mockResolvedValue(attempt);

      const result = await service.findOwnedAttemptOrThrow('attempt-1', student);
      expect(result).toBe(attempt);
    });

    it("lets an admin view any student's attempt", async () => {
      const attempt = { id: 'attempt-1', studentId: student.sub, examId: 'exam-1' };
      attemptRepo.findOne.mockResolvedValue(attempt);

      const result = await service.findOwnedAttemptOrThrow('attempt-1', admin);
      expect(result).toBe(attempt);
    });

    it("rejects a student trying to view someone else's attempt", async () => {
      const attempt = { id: 'attempt-1', studentId: student.sub, examId: 'exam-1' };
      attemptRepo.findOne.mockResolvedValue(attempt);

      await expect(service.findOwnedAttemptOrThrow('attempt-1', otherStudent)).rejects.toThrow(
        ForbiddenException,
      );
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'SECURITY_CHECK_FAILED',
        expect.objectContaining({ reason: 'ATTEMPT_OWNERSHIP_VIOLATION' }),
        otherStudent.sub,
      );
    });

    it('still rejects the ownership violation even when audit logging itself fails', async () => {
      const attempt = { id: 'attempt-1', studentId: student.sub, examId: 'exam-1' };
      attemptRepo.findOne.mockResolvedValue(attempt);
      auditService.logEvent.mockRejectedValueOnce(new Error('audit service unreachable'));

      // The security decision (reject) must never be skipped just because
      // logging that decision failed.
      await expect(service.findOwnedAttemptOrThrow('attempt-1', otherStudent)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for a missing attempt', async () => {
      attemptRepo.findOne.mockResolvedValue(null);
      await expect(service.findOwnedAttemptOrThrow('missing', student)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markSubmitted / markAutoSubmitted with an external EntityManager', () => {
    it('writes through the provided manager instead of the injected repository when one is given', async () => {
      const managerAttemptRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
      const managerSessionRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
      const manager = {
        getRepository: jest.fn((entity: any) => {
          if (entity === AttemptEntity) return managerAttemptRepo;
          if (entity === ExamSessionEntity) return managerSessionRepo;
          throw new Error(`Unexpected getRepository call for ${String(entity)}`);
        }),
      } as any;

      await service.markSubmitted('attempt-1', manager);

      expect(manager.getRepository).toHaveBeenCalledWith(AttemptEntity);
      expect(managerAttemptRepo.update).toHaveBeenCalledWith(
        { id: 'attempt-1' },
        expect.objectContaining({ status: AttemptStatus.SUBMITTED }),
      );
      expect(managerSessionRepo.update).toHaveBeenCalled();
      // The injected (non-transactional) repository must NOT be touched —
      // otherwise this write would sit outside whatever transaction the
      // caller opened, defeating the whole point of passing a manager in.
      expect(attemptRepo.update).not.toHaveBeenCalled();
      expect(sessionRepo.update).not.toHaveBeenCalled();
    });

    it('falls back to the injected repository when no manager is given (unchanged behaviour)', async () => {
      await service.markAutoSubmitted('attempt-1');

      expect(attemptRepo.update).toHaveBeenCalledWith(
        { id: 'attempt-1' },
        expect.objectContaining({ status: AttemptStatus.AUTO_SUBMITTED }),
      );
      expect(sessionRepo.update).toHaveBeenCalled();
    });

    it('throws NotFoundException instead of silently proceeding when the update affects zero rows', async () => {
      attemptRepo.update.mockResolvedValueOnce({ affected: 0 });

      await expect(service.markSubmitted('missing-or-raced-attempt')).rejects.toThrow(NotFoundException);
      // A status that couldn't actually be written must never be treated
      // as "submission finalized" by the caller.
      expect(sessionRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('findExpiredInProgressAttemptIds', () => {
    it('queries for IN_PROGRESS attempts with expiresAt before "now" and returns only their ids', async () => {
      attemptRepo.find.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      const now = new Date('2026-01-01T12:00:00Z');

      const ids = await service.findExpiredInProgressAttemptIds(now);

      expect(ids).toEqual(['a1', 'a2']);
      expect(attemptRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: AttemptStatus.IN_PROGRESS }),
          select: ['id'],
        }),
      );
    });
  });

  describe('listForMonitoring', () => {
    it('returns a paginated view with computed remaining time and isOverdue=false for a live attempt', async () => {
      const attempt = {
        id: 'attempt-1',
        examId: 'exam-1',
        studentId: 'student-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        submittedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      attemptRepo.findAndCount.mockResolvedValue([[attempt], 1]);

      const result = await service.listForMonitoring({ page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('attempt-1');
      expect(result.items[0].remainingSeconds).toBeGreaterThan(0);
      expect(result.items[0].lastSeenAt).toBeNull();
      expect(result.items[0].isOverdue).toBe(false);
    });

    it('flags isOverdue=true for an IN_PROGRESS attempt whose timer has already reached zero', async () => {
      const attempt = {
        id: 'attempt-2',
        examId: 'exam-1',
        studentId: 'student-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000), // already in the past
        submittedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      attemptRepo.findAndCount.mockResolvedValue([[attempt], 1]);

      const result = await service.listForMonitoring({ page: 1, limit: 20 });

      expect(result.items[0].remainingSeconds).toBe(0);
      expect(result.items[0].isOverdue).toBe(true);
    });

    it('never flags isOverdue for an attempt that has already been finalized', async () => {
      const attempt = {
        id: 'attempt-3',
        examId: 'exam-1',
        studentId: 'student-1',
        status: AttemptStatus.AUTO_SUBMITTED,
        startedAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      attemptRepo.findAndCount.mockResolvedValue([[attempt], 1]);

      const result = await service.listForMonitoring({ page: 1, limit: 20 });

      expect(result.items[0].isOverdue).toBe(false);
    });
  });
});
