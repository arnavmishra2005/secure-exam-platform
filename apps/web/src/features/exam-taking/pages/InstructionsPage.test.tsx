import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { getMyExam } from '@secure-exam/api-client';
import { StudentExamState, type StudentExamView } from '@secure-exam/types';
import InstructionsPage from './InstructionsPage';

vi.mock('@secure-exam/api-client', () => ({ getMyExam: vi.fn(), getMyAttemptForExam: vi.fn(), startAttempt: vi.fn() }));
vi.mock('../contexts/AttemptContext', () => ({ useAttempt: () => ({ setAttemptId: vi.fn() }) }));
vi.mock('../components/OpenInExamApp', () => ({ OpenInExamApp: () => null }));

const exam: StudentExamView = {
  examId: 'exam', title: 'End Sem', description: null, durationMinutes: 60,
  startTime: '2030-11-04T10:00:00Z', endTime: '2030-11-04T12:00:00Z', publishedAt: '2030-11-01T10:00:00Z',
  state: StudentExamState.UPCOMING, attemptId: null, attemptStatus: null, expiresAt: null, questionCount: 4,
  originalStartTime: null, rescheduled: false, scheduleNote: null,
};

describe('instruction duration', () => {
  it.each([0, 10, 25])('shows the base duration and %s added minutes', async extendedMinutes => {
    vi.mocked(getMyExam).mockResolvedValue({ ...exam, extendedMinutes });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><InstructionsPage /></MemoryRouter>
    </QueryClientProvider>);
    expect(await screen.findByText(extendedMinutes ? `60 minutes + ${extendedMinutes} extra minutes` : '60 minutes')).toBeTruthy();
  });
});
