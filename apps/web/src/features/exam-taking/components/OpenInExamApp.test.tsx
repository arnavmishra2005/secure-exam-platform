import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createExamLaunch = vi.fn();
vi.mock('@secure-exam/api-client', () => ({ createExamLaunch: (...a: unknown[]) => createExamLaunch(...a) }));

import { DesktopOnly } from './DesktopOnly';
import { OpenInExamApp } from './OpenInExamApp';

const ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'A'.repeat(43);
const realLocation = window.location;

beforeEach(() => {
  createExamLaunch.mockReset();
  Object.defineProperty(window, 'location', { configurable: true, value: { href: 'http://localhost/' } });
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  delete (window as { desktop?: unknown }).desktop;
});

describe('OpenInExamApp', () => {
  it('cannot start until the student accepts the instructions', () => {
    render(<OpenInExamApp examId={ID} resuming={false} />);
    const start = screen.getByRole('button', { name: /start exam in exam app/i });
    expect((start as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox'));
    expect((start as HTMLButtonElement).disabled).toBe(false);
  });

  it('asks for a one-time launch token and opens the app with it, never a password', async () => {
    createExamLaunch.mockResolvedValue({ token: TOKEN, expiresInSeconds: 120 });
    render(<OpenInExamApp examId={ID} resuming={false} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /start exam in exam app/i }));

    await waitFor(() => expect(window.location.href).toBe(`secure-exam://launch/${TOKEN}`));
    expect(createExamLaunch).toHaveBeenCalledWith(ID);
  });

  it('resuming needs no checkbox', async () => {
    createExamLaunch.mockResolvedValue({ token: TOKEN, expiresInSeconds: 120 });
    render(<OpenInExamApp examId={ID} resuming />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /resume in exam app/i }));
    await waitFor(() => expect(window.location.href).toContain('secure-exam://launch/'));
  });

  it('shows the problem and stays on the page when the token cannot be created', async () => {
    createExamLaunch.mockRejectedValue({ response: { status: 500, data: { message: 'Server error' } } });
    render(<OpenInExamApp examId={ID} resuming />);

    fireEvent.click(screen.getByRole('button', { name: /resume in exam app/i }));
    await waitFor(() => expect(screen.getByText('Server error')).toBeTruthy());
    expect(window.location.href).toBe('http://localhost/');
  });
});

describe('DesktopOnly', () => {
  it('replaces the exam with an explanation in a browser', () => {
    render(
      <MemoryRouter>
        <DesktopOnly>
          <p>the exam</p>
        </DesktopOnly>
      </MemoryRouter>,
    );
    expect(screen.queryByText('the exam')).toBeNull();
    expect(screen.getByText(/Open this exam in the Secure Exam app/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeTruthy();
  });

  it('shows the exam inside the exam app', () => {
    (window as { desktop?: unknown }).desktop = { isDesktop: () => true };
    render(
      <MemoryRouter>
        <DesktopOnly>
          <p>the exam</p>
        </DesktopOnly>
      </MemoryRouter>,
    );
    expect(screen.getByText('the exam')).toBeTruthy();
  });
});
