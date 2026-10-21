import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const previewExamLaunch = vi.fn();
const redeemExamLaunch = vi.fn();
vi.mock('@secure-exam/api-client', () => ({
  previewExamLaunch: (...a: unknown[]) => previewExamLaunch(...a),
  redeemExamLaunch: (...a: unknown[]) => redeemExamLaunch(...a),
}));
const signInWithSession = vi.fn();
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ signInWithSession }) }));
const clearTokens = vi.fn();
vi.mock('@/auth/session', () => ({ clearTokens: () => clearTokens() }));
const setAttemptId = vi.fn();
vi.mock('../contexts/AttemptContext', () => ({ useAttempt: () => ({ setAttemptId }), ATTEMPT_ID_KEY: 'exam_attempt_id' }));
const startOrResumeAttempt = vi.fn();
vi.mock('../lib/startOrResumeAttempt', () => ({
  startOrResumeAttempt: (...a: unknown[]) => startOrResumeAttempt(...a),
  AttemptUnavailableError: class extends Error {},
}));

import LaunchPage from './LaunchPage';

const TOKEN = 'A'.repeat(43);
const ready = { ok: true, checks: { singleDisplay: true, backendReachable: true, noForbiddenProcesses: true } };
const bridge = (over: Record<string, unknown> = {}) => {
  const desktop = {
    isDesktop: () => true,
    getLaunchToken: vi.fn().mockResolvedValue(TOKEN),
    clearLaunchToken: vi.fn(),
    getReadiness: vi.fn().mockResolvedValue(ready),
    exitKiosk: vi.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
  (window as { desktop?: unknown }).desktop = desktop;
  return desktop;
};
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/launch']}>
      <Routes>
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/student/exam" element={<p>THE EXAM</p>} />
        <Route path="/" element={<p>HOME</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  for (const m of [previewExamLaunch, redeemExamLaunch, signInWithSession, setAttemptId, startOrResumeAttempt, clearTokens]) m.mockReset();
  previewExamLaunch.mockResolvedValue({ email: 'alice@secure-exam.dev', fullName: 'Alice Johnson', examId: 'exam-1' });
});
afterEach(() => {
  delete (window as { desktop?: unknown }).desktop;
  sessionStorage.clear();
});

describe('LaunchPage', () => {
  it('shows the student their email and a masked password that cannot be changed', async () => {
    bridge();
    renderPage();

    const email = (await screen.findByLabelText('Email')) as HTMLInputElement;
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    expect(email.value).toBe('alice@secure-exam.dev');
    expect(email.readOnly).toBe(true);
    expect(password.type).toBe('password');
    expect(password.readOnly).toBe(true);
    expect(password.value).not.toBe('');
    expect(screen.getByText(/signing in as Alice Johnson/i)).toBeTruthy();
    expect(previewExamLaunch).toHaveBeenCalledWith(TOKEN);
  });

  it('Login swaps the token for a session, forgets the token and goes straight into the exam', async () => {
    const desktop = bridge();
    redeemExamLaunch.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' }, examId: 'exam-1' });
    startOrResumeAttempt.mockResolvedValue('attempt-1');
    renderPage();

    const login = await screen.findByRole('button', { name: 'Login' });
    await waitFor(() => expect((login as HTMLButtonElement).disabled).toBe(false)); // readiness passed
    fireEvent.click(login);

    expect(await screen.findByText('THE EXAM')).toBeTruthy();
    expect(redeemExamLaunch).toHaveBeenCalledWith(TOKEN);
    expect(desktop.clearLaunchToken).toHaveBeenCalled();
    expect(signInWithSession).toHaveBeenCalled();
    expect(startOrResumeAttempt).toHaveBeenCalledWith('exam-1');
    expect(setAttemptId).toHaveBeenCalledWith('attempt-1');
  });

  it('Login stays disabled while a readiness check fails', async () => {
    bridge({ getReadiness: vi.fn().mockResolvedValue({ ok: false, checks: { singleDisplay: false, backendReachable: true, noForbiddenProcesses: true } }) });
    renderPage();

    const login = (await screen.findByRole('button', { name: 'Login' })) as HTMLButtonElement;
    await screen.findByText('Single display');
    expect(login.disabled).toBe(true);
    expect(redeemExamLaunch).not.toHaveBeenCalled();
  });

  it('explains how to start when the app is opened without a launch link', async () => {
    bridge({ getLaunchToken: vi.fn().mockResolvedValue(null) });
    renderPage();

    expect(await screen.findByText(/Open your exam from the browser/i)).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(previewExamLaunch).not.toHaveBeenCalled();
  });

  it('forgets any old login when opened without a link', async () => {
    bridge({ getLaunchToken: vi.fn().mockResolvedValue(null) });
    renderPage();
    await screen.findByText(/Open your exam from the browser/i);
    expect(clearTokens).toHaveBeenCalled();
  });

  it('keeps the login when it is reached during a running exam (a stray redirect must not sign the student out)', async () => {
    sessionStorage.setItem('exam_attempt_id', 'attempt-1');
    bridge({ getLaunchToken: vi.fn().mockResolvedValue(null) });
    renderPage();
    await screen.findByText(/Open your exam from the browser/i);
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it('says the link has expired when the API answers 410, with only a Close button', async () => {
    bridge();
    previewExamLaunch.mockRejectedValue({ response: { status: 410 } });
    renderPage();

    expect(await screen.findByText(/launch link has expired/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Login' })).toBeNull();
  });

  it('a spent token is not offered again when the exam cannot be started', async () => {
    bridge();
    redeemExamLaunch.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' }, examId: 'exam-1' });
    startOrResumeAttempt.mockRejectedValue(new Error('This exam is not currently active'));
    renderPage();

    const login = await screen.findByRole('button', { name: 'Login' });
    await waitFor(() => expect((login as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(login);

    expect(await screen.findByText(/Could not start the exam/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Login' })).toBeNull();
  });

  it('is not available in a browser', async () => {
    renderPage(); // no window.desktop
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(previewExamLaunch).not.toHaveBeenCalled();
  });
});
