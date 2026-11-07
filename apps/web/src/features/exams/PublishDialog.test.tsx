import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublishReadiness, publishExam } from '@secure-exam/api-client';
import { ExamStatus, type Exam } from '@secure-exam/types';
import { PublishDialog } from './PublishDialog';

vi.mock('@secure-exam/api-client', () => ({ getPublishReadiness: vi.fn(), publishExam: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const exam = {
  id: 'exam-1', title: 'Quiz 1', description: null, durationMinutes: 30,
  startTime: '2030-01-01T10:00:00Z', endTime: '2030-01-01T11:00:00Z', status: ExamStatus.DRAFT,
  publishedAt: null, passPercentage: 40, passMarkEnabled: true, courseId: 'course-1',
  originalStartTime: null, scheduleNote: null, createdAt: '2029-12-01T00:00:00Z', updatedAt: '2029-12-01T00:00:00Z',
} as unknown as Exam;

function open(e: Exam) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PublishDialog exam={e} open onOpenChange={vi.fn()} onPublished={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('PublishDialog pass mark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPublishReadiness).mockResolvedValue({ canPublish: true, problems: [], registeredCount: 3, questionCount: 5 } as never);
    vi.mocked(publishExam).mockResolvedValue({ notifiedCount: 3 } as never);
  });

  it('asks for the pass mark when the exam uses one', async () => {
    open(exam);
    expect(await screen.findByLabelText('Pass mark (%)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /publish and notify/i }));
    await waitFor(() => expect(publishExam).toHaveBeenCalledWith('exam-1', { passPercentage: 40, message: undefined }));
  });

  it('does not ask for or send a pass mark when the instructor turned it off', async () => {
    open({ ...exam, passMarkEnabled: false });
    expect(await screen.findByText('Ready to publish.')).toBeTruthy();
    expect(screen.queryByLabelText('Pass mark (%)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /publish and notify/i }));
    await waitFor(() => expect(publishExam).toHaveBeenCalledWith('exam-1', { message: undefined }));
  });
});
