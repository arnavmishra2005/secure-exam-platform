// Smoke test: the real router + unified login send each role to its own home.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  login: vi.fn(),
  getExams: vi.fn(async () => []),
  getMyDashboard: vi.fn(),
  listNotifications: vi.fn(async () => ({ items: [], unreadCount: 0 })),
  getMyAccess: vi.fn(),
}));

vi.mock('@secure-exam/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@secure-exam/api-client')>();
  return {
    ...actual,
    login: api.login,
    refresh: vi.fn(async () => {
      throw new Error('no session');
    }),
    getMe: vi.fn(),
    logout: vi.fn(async () => undefined),
    getExams: api.getExams,
    getMyDashboard: api.getMyDashboard,
    listNotifications: api.listNotifications,
    getMyAccess: api.getMyAccess,
  };
});

import App from '../App';

function signIn(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('App', () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
    window.localStorage?.clear?.();
  });

  it('sends a signed-out visitor to the single login page', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(window.location.pathname).toBe('/login');
  });

  it('lands an instructor on /instructor/exams, with every menu', async () => {
    api.getMyAccess.mockResolvedValue({ userId: 'u1', role: 'instructor', courses: [] });
    api.login.mockResolvedValueOnce({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', email: 'inst@x.edu', fullName: 'Ida Instructor', role: 'instructor' },
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    signIn('inst@x.edu');

    await waitFor(() => expect(window.location.pathname).toBe('/instructor/exams'));
    expect(await screen.findByText('No exams yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Live monitoring/ })).toBeTruthy();
    expect(screen.getByText(/Instructor · inst@x.edu/)).toBeTruthy();
  });

  it('shows a TA only the menus their permissions allow', async () => {
    api.getMyAccess.mockResolvedValue({
      userId: 'u3',
      role: 'ta',
      courses: [{ courseId: 'c1', code: 'CS201', name: 'OS', role: 'TA', permissions: ['EXAM_VIEW', 'MONITOR'] }],
    });
    api.login.mockResolvedValueOnce({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u3', email: 'ta@x.edu', fullName: 'Tara Assistant', role: 'ta' },
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    signIn('ta@x.edu');

    await waitFor(() => expect(window.location.pathname).toBe('/instructor/exams'));
    expect(await screen.findByRole('link', { name: /Live monitoring/ })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('link', { name: /Results/ })).toBeNull());
    expect(screen.queryByRole('link', { name: /Question bank/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /New exam/ })).toBeNull();
  });

  it('redirects old /admin links to /instructor', async () => {
    window.history.pushState({}, '', '/admin/courses');
    render(<App />);
    // Signed out, so the redirect ends at the login page, remembering /instructor/courses.
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('lands a student on /student/dashboard', async () => {
    api.getMyDashboard.mockResolvedValue({
      serverTime: new Date().toISOString(),
      student: { userId: 'u2', studentId: 's2', fullName: 'Sam Student', email: 's@x.edu', collegeId: 'CS1' },
      live: [],
      upcoming: [],
      completed: [],
      results: [],
      notifications: { unreadCount: 0, latest: [] },
    });
    api.login.mockResolvedValueOnce({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u2', email: 's@x.edu', fullName: 'Sam Student', role: 'student' },
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    signIn('s@x.edu');

    await waitFor(() => expect(window.location.pathname).toBe('/student/dashboard'));
    expect(await screen.findByText('Hello, Sam')).toBeTruthy();
  });
});
