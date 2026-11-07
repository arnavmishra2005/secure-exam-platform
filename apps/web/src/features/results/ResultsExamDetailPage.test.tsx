import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '@secure-exam/api-client';
import { ExamStatus, Permission } from '@secure-exam/types';
import ResultsExamDetailPage from './ResultsExamDetailPage';

vi.mock('@secure-exam/api-client', () => ({ getExam: vi.fn(), publishExamResults: vi.fn(), recalculateResults: vi.fn() }));
vi.mock('./tabs.registry', () => ({ resultsTabs: [{ id: 'overview', label: 'Overview', component: () => <p>overview</p>, owner: 'A' }] }));
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const can = vi.fn();
vi.mock('@/auth/useAccess', () => ({ useAccess: () => ({ can }) }));

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/instructor/results/exam-1']}>
        <Routes>
          <Route path="/instructor/results/:examId" element={<ResultsExamDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResultsExamDetailPage recalculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.getExam).mockResolvedValue({
      id: 'exam-1', title: 'Quiz', status: ExamStatus.CLOSED, courseId: 'c1', startTime: '2030-01-01T10:00:00Z',
      endTime: '2030-01-01T11:00:00Z', passMarkEnabled: true, passPercentage: 40,
    } as never);
    vi.mocked(client.recalculateResults).mockResolvedValue({ attempts: 3, recalculatedNow: 2, queuedToRerun: 1 });
  });

  it('offers one "Recalculate results" action (no separate Re-grade) and runs the full recalculation', async () => {
    can.mockReturnValue(true);
    renderPage();
    expect(await screen.findByText('Quiz')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /re-grade/i })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /recalculate results/i })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Recalculate' }));
    await waitFor(() => expect(client.recalculateResults).toHaveBeenCalledWith('exam-1'));
  });

  it('hides it from staff without MARKS_ADJUST', async () => {
    can.mockImplementation((p: Permission) => p !== Permission.MARKS_ADJUST);
    renderPage();
    expect(await screen.findByText('Quiz')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /recalculate/i })).toBeNull();
  });
});
