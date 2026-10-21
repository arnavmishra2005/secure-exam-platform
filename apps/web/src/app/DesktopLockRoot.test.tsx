import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DesktopLockRoot } from './DesktopLockRoot';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<DesktopLockRoot />}>
          <Route path="/launch" element={<p>LAUNCH</p>} />
          <Route path="/student/exam" element={<p>EXAM</p>} />
          <Route path="/student/exam/submitted" element={<p>SUBMITTED</p>} />
          <Route path="/student/dashboard" element={<p>DASHBOARD</p>} />
          <Route path="/admin/exams" element={<p>ADMIN</p>} />
          <Route path="/login" element={<p>LOGIN</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => {
  delete (window as { desktop?: unknown }).desktop;
  sessionStorage.clear();
});

describe('DesktopLockRoot', () => {
  it('in the exam app, sends every other screen back to the launch screen', () => {
    (window as { desktop?: unknown }).desktop = { isDesktop: () => true };
    for (const path of ['/student/dashboard', '/admin/exams', '/login']) {
      const { unmount } = renderAt(path);
      expect(screen.getByText('LAUNCH')).toBeTruthy();
      unmount();
    }
  });

  it('in the exam app, sends a stray route back to the exam when an attempt is running', () => {
    (window as { desktop?: unknown }).desktop = { isDesktop: () => true };
    sessionStorage.setItem('exam_attempt_id', 'attempt-1');
    renderAt('/student/dashboard');
    expect(screen.getByText('EXAM')).toBeTruthy();
  });

  it('in the exam app, lets the three exam screens through', () => {
    (window as { desktop?: unknown }).desktop = { isDesktop: () => true };
    for (const [path, text] of [['/launch', 'LAUNCH'], ['/student/exam', 'EXAM'], ['/student/exam/submitted', 'SUBMITTED']]) {
      const { unmount } = renderAt(path);
      expect(screen.getByText(text)).toBeTruthy();
      unmount();
    }
  });

  it('in a browser, changes nothing', () => {
    for (const [path, text] of [['/student/dashboard', 'DASHBOARD'], ['/admin/exams', 'ADMIN'], ['/login', 'LOGIN']]) {
      const { unmount } = renderAt(path);
      expect(screen.getByText(text)).toBeTruthy();
      unmount();
    }
  });
});
