// Person A: rescheduling a published exam (#5) and exams created in a course (#1).

import { BadRequestException } from '@nestjs/common';
import { ExamStatus, NotificationType } from '@secure-exam/types';
import { ExamService } from './exam.service';

const HOUR = 3_600_000;
const start = new Date('2026-12-01T09:00:00Z');
const end = new Date(start.getTime() + 3 * HOUR);

function setup(exam: Record<string, unknown>, attempts = 0) {
  const examRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Midterm', ...exam }),
    save: jest.fn(async (e) => e),
    create: jest.fn((e) => e),
    query: jest.fn().mockResolvedValue([{ count: String(attempts) }]),
  };
  const registrationService = { notifyRegistered: jest.fn().mockResolvedValue(3), assignCourse: jest.fn() };
  const auditService = { logEvent: jest.fn() };
  const service = new ExamService(examRepo as never, registrationService as never, auditService as never);
  return { service, examRepo, registrationService, auditService };
}

const published = {
  status: ExamStatus.SCHEDULED,
  startTime: start,
  endTime: end,
  durationMinutes: 60,
  publishedAt: new Date('2026-11-20T00:00:00Z'),
  originalStartTime: null,
  scheduleNote: null,
};

describe('ExamService.reschedule', () => {
  it('moves a published exam nobody has started, remembers the original start and notifies students', async () => {
    const { service, registrationService, auditService } = setup(published);
    const later = new Date(start.getTime() + HOUR);

    const saved = await service.reschedule(
      'exam-1',
      { startTime: later.toISOString(), endTime: new Date(end.getTime() + HOUR).toISOString(), note: 'Lab network down' },
      'inst-1',
    );

    expect(saved.startTime).toEqual(later);
    expect(saved.originalStartTime).toEqual(start);
    expect(saved.scheduleNote).toBe('Lab network down');
    expect(auditService.logEvent).toHaveBeenCalledWith('EXAM_RESCHEDULED', expect.objectContaining({ examId: 'exam-1' }), 'inst-1');
    expect(registrationService.notifyRegistered).toHaveBeenCalledWith(
      'exam-1',
      expect.objectContaining({ type: NotificationType.EXAM_RESCHEDULED }),
    );
  });

  it('keeps the first original start when moved twice', async () => {
    const first = new Date(start.getTime() - 24 * HOUR);
    const { service } = setup({ ...published, originalStartTime: first });
    const saved = await service.reschedule('exam-1', { startTime: new Date(start.getTime() + HOUR).toISOString() }, 'i');
    expect(saved.originalStartTime).toEqual(first);
  });

  it('does not notify anyone about an unpublished exam', async () => {
    const { service, registrationService } = setup({ ...published, publishedAt: null });
    const saved = await service.reschedule('exam-1', { endTime: new Date(end.getTime() + HOUR).toISOString() }, 'i');
    expect(saved.originalStartTime).toBeNull();
    expect(registrationService.notifyRegistered).not.toHaveBeenCalled();
  });

  it('once someone started: only a later end time', async () => {
    const { service } = setup({ ...published, status: ExamStatus.ACTIVE }, 4);
    await expect(
      service.reschedule('exam-1', { startTime: new Date(start.getTime() + HOUR).toISOString() }, 'i'),
    ).rejects.toThrow('only its end time can change');
    await expect(service.reschedule('exam-1', { durationMinutes: 90 }, 'i')).rejects.toThrow('only its end time');
    await expect(
      service.reschedule('exam-1', { endTime: new Date(end.getTime() - HOUR).toISOString() }, 'i'),
    ).rejects.toThrow('only move later');
    const saved = await service.reschedule('exam-1', { endTime: new Date(end.getTime() + HOUR).toISOString() }, 'i');
    expect(saved.endTime).toEqual(new Date(end.getTime() + HOUR));
  });

  it('refuses a closed exam, an empty change, a reversed window and a duration longer than the window', async () => {
    await expect(setup({ ...published, status: ExamStatus.CLOSED }).service.reschedule('exam-1', { note: 'x' }, 'i')).rejects.toThrow(
      'closed exam',
    );
    await expect(setup(published).service.reschedule('exam-1', {}, 'i')).rejects.toThrow('Nothing to change');
    await expect(
      setup(published).service.reschedule('exam-1', { endTime: new Date(start.getTime() - HOUR).toISOString() }, 'i'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup(published).service.reschedule('exam-1', { durationMinutes: 240 }, 'i')).rejects.toThrow(
      'longer than the window',
    );
  });

  it('clears the note when given an empty one', async () => {
    const { service } = setup({ ...published, scheduleNote: 'old' });
    const saved = await service.reschedule('exam-1', { note: '  ' }, 'i');
    expect(saved.scheduleNote).toBeNull();
  });
});

describe('ExamService.create', () => {
  it('saves the owning course and assigns it, registering its students', async () => {
    const { service, examRepo, registrationService } = setup({});
    examRepo.save.mockImplementation(async (e) => ({ ...e, id: 'exam-9' }));

    await service.create(
      {
        courseId: 'course-1',
        title: 'Quiz',
        durationMinutes: 30,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        passMarkEnabled: false,
      },
      'inst-1',
    );

    expect(examRepo.create).toHaveBeenCalledWith(expect.objectContaining({ courseId: 'course-1', passMarkEnabled: false }));
    expect(registrationService.assignCourse).toHaveBeenCalledWith('exam-9', 'course-1', 'inst-1');
  });
});
