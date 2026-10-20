import { ExamStatus } from '@secure-exam/types';
import { ExamLookupAdapter } from './exam-lookup.adapter';

describe('ExamLookupAdapter', () => {
  // The caller passes the JWT `sub`, which is a users.id.
  const USER_ID = 'user-1';

  function makeAdapter(overrides: { isUserRegistered?: jest.Mock; findOne?: jest.Mock; findManyByIds?: jest.Mock } = {}) {
    const examService = {
      findOne: overrides.findOne ?? jest.fn(),
      findManyByIds: overrides.findManyByIds ?? jest.fn().mockResolvedValue([]),
    };
    const registrationService = { isUserRegistered: overrides.isUserRegistered ?? jest.fn() };
    return { adapter: new ExamLookupAdapter(examService as any, registrationService as any), registrationService };
  }

  describe('isStudentAssignedToExam', () => {
    it('admits a registered student', async () => {
      const { adapter, registrationService } = makeAdapter({ isUserRegistered: jest.fn().mockResolvedValue(true) });

      await expect(adapter.isStudentAssignedToExam('exam-1', USER_ID)).resolves.toBe(true);
      expect(registrationService.isUserRegistered).toHaveBeenCalledWith('exam-1', USER_ID);
    });

    it('rejects an unregistered student — including when the exam has no registrations at all', async () => {
      const { adapter } = makeAdapter({ isUserRegistered: jest.fn().mockResolvedValue(false) });

      await expect(adapter.isStudentAssignedToExam('exam-1', USER_ID)).resolves.toBe(false);
    });

    it('fails closed when the registration lookup errors', async () => {
      const { adapter } = makeAdapter({ isUserRegistered: jest.fn().mockRejectedValue(new Error('db down')) });

      await expect(adapter.isStudentAssignedToExam('exam-1', USER_ID)).resolves.toBe(false);
    });
  });

  describe('getExamById', () => {
    it('maps the exam, including publishedAt', async () => {
      const publishedAt = new Date('2026-01-01T09:00:00Z');
      const { adapter } = makeAdapter({
        findOne: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: ExamStatus.ACTIVE,
          startTime: new Date('2026-01-01T10:00:00Z'),
          endTime: new Date('2026-01-01T11:00:00Z'),
          durationMinutes: 45,
          publishedAt,
        }),
      });

      await expect(adapter.getExamById('exam-1')).resolves.toEqual({
        id: 'exam-1',
        status: 'ACTIVE',
        startTime: '2026-01-01T10:00:00.000Z',
        endTime: '2026-01-01T11:00:00.000Z',
        durationMinutes: 45,
        publishedAt: publishedAt.toISOString(),
      });
    });

    it('returns null when the exam is missing', async () => {
      const { adapter } = makeAdapter({ findOne: jest.fn().mockRejectedValue(new Error('not found')) });

      await expect(adapter.getExamById('missing')).resolves.toBeNull();
    });
  });
});
