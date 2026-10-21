import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let submitState: 'idle' | 'pending' | 'submitted' | 'failed' = 'submitted';
vi.mock('../hooks/useSyncStatus', () => ({
  useSyncStatus: (select: (s: { submit: string }) => unknown) => select({ submit: submitState }),
}));
const setAttemptId = vi.fn();
vi.mock('../contexts/AttemptContext', () => ({ useAttempt: () => ({ setAttemptId }) }));

import { AUTO_CLOSE_SECONDS, ExamAppSubmitted } from './ExamAppSubmitted';

const bridge = () => {
  const desktop = { isDesktop: () => true, notifySubmitted: vi.fn(), exitKiosk: vi.fn().mockResolvedValue({ ok: true }) };
  (window as { desktop?: unknown }).desktop = desktop;
  return desktop;
};

beforeEach(() => {
  vi.useFakeTimers();
  setAttemptId.mockReset();
  submitState = 'submitted';
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as { desktop?: unknown }).desktop;
});

describe('ExamAppSubmitted', () => {
  it('only says the answers are on the server, the results come later, and offers Close', () => {
    bridge();
    render(<ExamAppSubmitted />);

    expect(screen.getByText('Exam submitted')).toBeTruthy();
    expect(screen.getByText(/submitted to the server/i)).toBeTruthy();
    expect(screen.getByText(/instructor will publish the results/i)).toBeTruthy();
    expect(screen.getByText(/check them in your browser/i)).toBeTruthy();
    // nowhere else to go
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Close app']);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/dashboard/i)).toBeNull();
    expect(screen.queryByText(/sign out/i)).toBeNull();
  });

  it('tells the app the exam is over and forgets the attempt', () => {
    const desktop = bridge();
    render(<ExamAppSubmitted />);
    expect(desktop.notifySubmitted).toHaveBeenCalled();
    expect(setAttemptId).toHaveBeenCalledWith(null);
  });

  it('Close app closes the app', () => {
    const desktop = bridge();
    render(<ExamAppSubmitted />);
    act(() => screen.getByRole('button', { name: 'Close app' }).click());
    expect(desktop.exitKiosk).toHaveBeenCalledTimes(1);
  });

  it('closes by itself after 30 seconds, and counts down', () => {
    const desktop = bridge();
    render(<ExamAppSubmitted />);
    expect(AUTO_CLOSE_SECONDS).toBe(30);
    expect(screen.getByText(/closes automatically in 30 seconds/i)).toBeTruthy();

    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByText(/closes automatically in 20 seconds/i)).toBeTruthy();
    expect(desktop.exitKiosk).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(20_000));
    expect(desktop.exitKiosk).toHaveBeenCalled();
  });

  it('does not close, release the lock or count down while the submission is still pending', () => {
    submitState = 'pending';
    const desktop = bridge();
    render(<ExamAppSubmitted />);

    expect(screen.getByText('Submission pending')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close app' })).toBeNull();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(desktop.notifySubmitted).not.toHaveBeenCalled();
    expect(desktop.exitKiosk).not.toHaveBeenCalled();
  });

  it('does not auto-close when the server could not confirm the submission', () => {
    submitState = 'failed';
    const desktop = bridge();
    render(<ExamAppSubmitted />);

    expect(screen.getByText(/could not confirm/i)).toBeTruthy();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(desktop.exitKiosk).not.toHaveBeenCalled();
  });
});
