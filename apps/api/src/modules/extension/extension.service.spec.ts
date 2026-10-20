import { BadRequestException, ConflictException } from '@nestjs/common';
import { ExamStatus, ExtensionScope, NotificationType } from '@secure-exam/types';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { ExamExtensionEntity } from './entities/exam-extension.entity';
import { ExtensionService } from './extension.service';

describe('ExtensionService', () => {
  let exam: any;
  let examService: any;
  let registrationService: any;
  let userService: any;
  let notificationService: any;
  let auditService: any;
  let events: any;
  let updateQb: any;
  let managerAttemptRepo: any;
  let managerExtensionRepo: any;
  let dataSource: any;
  let service: ExtensionService;

  beforeEach(() => {
    exam = { id: 'exam-1', title: 'Compilers', status: ExamStatus.ACTIVE };
    examService = {
      findOne: jest.fn(async () => exam),
      extendEndTime: jest.fn().mockResolvedValue(undefined),
    };
    registrationService = {
      isUserRegistered: jest.fn().mockResolvedValue(true),
      registeredUserIds: jest.fn().mockResolvedValue(['u1', 'u2']),
    };
    userService = {
      resolveStudents: jest.fn(async (ids: string[]) => ({
        found: new Map(ids.map((id) => [id, { id: 'student-row', userId: 'u1' }])),
        notFound: [],
      })),
    };
    notificationService = { notifyMany: jest.fn().mockResolvedValue(1) };
    auditService = { logEvent: jest.fn() };
    events = { emitAsync: jest.fn().mockResolvedValue([]) };

    updateQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [{ id: 'a1' }, { id: 'a2' }] }),
    };
    managerAttemptRepo = { findOne: jest.fn().mockResolvedValue(null) };
    managerExtensionRepo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: 'ext-1', createdAt: new Date(), ...x })),
    };
    const manager = {
      createQueryBuilder: jest.fn(() => updateQb),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === AttemptEntity) return managerAttemptRepo;
        if (entity === ExamExtensionEntity) return managerExtensionRepo;
        throw new Error('unexpected repository');
      }),
    };
    dataSource = {
      transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
      getRepository: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) })),
    };

    service = new ExtensionService(
      {} as any,
      dataSource,
      examService,
      registrationService,
      userService,
      notificationService,
      auditService,
      events,
    );
  });

  it('extends the whole exam: moves the end time, pushes running attempts, notifies registered students', async () => {
    const result = await service.extend('exam-1', { minutes: 10, reason: 'Power cut' }, 'admin-1');

    expect(examService.extendEndTime).toHaveBeenCalledWith('exam-1', 10, expect.anything());
    expect(updateQb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('studentId'), expect.anything());
    expect(result).toMatchObject({ scope: ExtensionScope.ALL, studentId: null, minutes: 10, affectedAttempts: 2, reason: 'Power cut' });
    expect(notificationService.notifyMany).toHaveBeenCalledWith(
      ['u1', 'u2'],
      expect.objectContaining({ type: NotificationType.EXAM_EXTENDED }),
    );
    expect(events.emitAsync).toHaveBeenCalledWith('exam.extended', expect.objectContaining({ studentId: null, minutes: 10 }));
  });

  it('extends one student without touching the exam end time', async () => {
    updateQb.execute.mockResolvedValue({ raw: [{ id: 'a1' }] });

    const result = await service.extend('exam-1', { minutes: 5, studentId: 'student-row' }, 'admin-1');

    expect(examService.extendEndTime).not.toHaveBeenCalled();
    expect(updateQb.andWhere).toHaveBeenCalledWith('"studentId" = :studentId', { studentId: 'u1' });
    expect(result).toMatchObject({ scope: ExtensionScope.STUDENT, studentId: 'u1', affectedAttempts: 1 });
    expect(notificationService.notifyMany).toHaveBeenCalledWith(['u1'], expect.anything());
  });

  it('records a pending extension for a registered student who has not started', async () => {
    updateQb.execute.mockResolvedValue({ raw: [] });

    const result = await service.extend('exam-1', { minutes: 5, studentId: 'student-row' }, 'admin-1');

    expect(result.affectedAttempts).toBe(0);
    expect(managerExtensionRepo.save).toHaveBeenCalled();
  });

  it('refuses to extend a student who already submitted', async () => {
    updateQb.execute.mockResolvedValue({ raw: [] });
    managerAttemptRepo.findOne.mockResolvedValue({ id: 'a1', status: 'SUBMITTED' });

    await expect(service.extend('exam-1', { minutes: 5, studentId: 'student-row' }, 'admin-1')).rejects.toThrow(
      ConflictException,
    );
    expect(managerExtensionRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a student who is neither registered nor attempting', async () => {
    registrationService.isUserRegistered.mockResolvedValue(false);

    await expect(service.extend('exam-1', { minutes: 5, studentId: 'student-row' }, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses to extend a closed exam', async () => {
    exam.status = ExamStatus.CLOSED;
    await expect(service.extend('exam-1', { minutes: 5 }, 'admin-1')).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
