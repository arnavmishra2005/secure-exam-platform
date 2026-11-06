import { beforeEach, expect, it, vi } from 'vitest';
import { getMyAttemptForExam, startAttempt } from '@secure-exam/api-client';
import { startOrResumeAttempt } from './startOrResumeAttempt';
vi.mock('@secure-exam/api-client', () => ({ getMyAttemptForExam: vi.fn(), startAttempt: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it('resumes an approved running attempt without new-attempt window checks', async () => {
  vi.mocked(getMyAttemptForExam).mockResolvedValue({ id: 'extended-attempt', status: 'IN_PROGRESS' } as never);
  await expect(startOrResumeAttempt('exam')).resolves.toBe('extended-attempt');
  expect(startAttempt).not.toHaveBeenCalled();
});
it('starts only when no existing attempt exists', async () => {
  vi.mocked(getMyAttemptForExam).mockRejectedValue({ response: { status: 404 } });
  vi.mocked(startAttempt).mockResolvedValue({ id: 'new' } as never);
  await expect(startOrResumeAttempt('exam')).resolves.toBe('new');
});
it('does not start after a session-moved or unavailable-server error', async () => {
  vi.mocked(getMyAttemptForExam).mockRejectedValue({ response: { status: 409, data: { message: 'Session moved' } } });
  await expect(startOrResumeAttempt('exam')).rejects.toThrow('Session moved');
  expect(startAttempt).not.toHaveBeenCalled();
});
