import { BadRequestException, ConflictException } from '@nestjs/common';
import { ExamStatus, NotificationType } from '@secure-exam/types';
import { PublishService } from './publish.service';

describe('PublishService', () => {
  const future = (minutes: number) => new Date(Date.now() + minutes * 60_000);
  let exam: any;
  let examService: any;
  let examRepo: any;
  let examQuestionRepo: any;
  let registrationService: any;
  let notificationService: any;
  let auditService: any;
  let events: any;
  let service: PublishService;

  beforeEach(() => {
    exam = {
      id: 'exam-1',
      title: 'Networks',
      description: null,
      durationMinutes: 60,
      startTime: future(60),
      endTime: future(180),
      status: ExamStatus.DRAFT,
      publishedAt: null,
      passPercentage: 40,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    examService = {
      findOne: jest.fn(async () => ({ ...exam })),
      schedule: jest.fn(async () => {
        exam.status = ExamStatus.SCHEDULED;
        return { ...exam };
      }),
    };
    const updateQb: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn((values: any) => {
        updateQb.values = values;
        return updateQb;
      }),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => {
        Object.assign(exam, updateQb.values);
        return { affected: 1 };
      }),
      values: {} as any,
    };
    examRepo = { createQueryBuilder: jest.fn(() => updateQb) };
    examQuestionRepo = { count: jest.fn().mockResolvedValue(5) };
    registrationService = {
      countForExam: jest.fn().mockResolvedValue(3),
      registeredUserIds: jest.fn().mockResolvedValue(['u1', 'u2', 'u3']),
    };
    notificationService = { notifyMany: jest.fn(async (ids: string[]) => ids.length) };
    auditService = { logEvent: jest.fn() };
    events = { emitAsync: jest.fn().mockResolvedValue([]) };
    service = new PublishService(
      examRepo,
      examQuestionRepo,
      examService,
      registrationService,
      notificationService,
      auditService,
      events,
    );
  });

  it('reports what blocks publishing', async () => {
    examQuestionRepo.count.mockResolvedValue(0);
    registrationService.countForExam.mockResolvedValue(0);

    const readiness = await service.readiness('exam-1');

    expect(readiness.canPublish).toBe(false);
    expect(readiness.problems).toEqual([
      'The exam has no questions.',
      'No students are registered. Assign a course or add students first.',
    ]);
  });

  it('schedules a draft, stamps publishedAt, notifies every registered student and emits exam.published', async () => {
    const result = await service.publish('exam-1', { passPercentage: 50, message: 'Bring a pencil.' }, 'admin-1');

    expect(examService.schedule).toHaveBeenCalledWith('exam-1', 'admin-1');
    expect(result.exam.publishedAt).not.toBeNull();
    expect(result.exam.passPercentage).toBe(50);
    expect(result.notifiedCount).toBe(3);
    expect(notificationService.notifyMany).toHaveBeenCalledWith(
      ['u1', 'u2', 'u3'],
      expect.objectContaining({ type: NotificationType.EXAM_PUBLISHED, body: expect.stringContaining('Bring a pencil.') }),
    );
    expect(events.emitAsync).toHaveBeenCalledWith('exam.published', expect.objectContaining({ examId: 'exam-1' }));
  });

  it('does not re-schedule an exam that is already scheduled', async () => {
    exam.status = ExamStatus.SCHEDULED;
    await service.publish('exam-1', {}, 'admin-1');
    expect(examService.schedule).not.toHaveBeenCalled();
  });

  it('rejects publishing twice with 409', async () => {
    exam.publishedAt = new Date();
    await expect(service.publish('exam-1', {}, 'admin-1')).rejects.toThrow(ConflictException);
  });

  it('rejects an exam with no questions with 400 and notifies nobody', async () => {
    examQuestionRepo.count.mockResolvedValue(0);
    await expect(service.publish('exam-1', {}, 'admin-1')).rejects.toThrow(BadRequestException);
    expect(notificationService.notifyMany).not.toHaveBeenCalled();
  });

  it('still returns success when an exam.published listener fails', async () => {
    events.emitAsync.mockRejectedValue(new Error('snapshot failed'));
    await expect(service.publish('exam-1', {}, 'admin-1')).resolves.toMatchObject({ notifiedCount: 3 });
  });
});
