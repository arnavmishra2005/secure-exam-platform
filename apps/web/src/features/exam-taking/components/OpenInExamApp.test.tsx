import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createExamLaunch = vi.fn();
const createCaptcha = vi.fn();
const challenge = { captchaId: 'captcha-1', svg: '<svg/>' };
vi.mock('@secure-exam/api-client', () => ({ createExamLaunch: (...a: unknown[]) => createExamLaunch(...a), createCaptcha: () => createCaptcha() }));

import { DesktopOnly } from './DesktopOnly';
import { OpenInExamApp } from './OpenInExamApp';

const ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'A'.repeat(43);
const realLocation = window.location;

beforeEach(() => {
  createExamLaunch.mockReset();
  createCaptcha.mockReset().mockResolvedValue(challenge);
  Object.defineProperty(window, 'location', { configurable: true, value: { href: 'http://localhost/' } });
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  delete (window as { desktop?: unknown }).desktop;
});

async function enterCaptcha() {
  await screen.findByRole('img');
  fireEvent.change(screen.getByLabelText('Enter the characters in the image'), { target: { value: 'abc23' } });
}

describe('OpenInExamApp', () => {
  it('requires both instructions consent and captcha', async () => {
    render(<OpenInExamApp examId={ID} resuming={false} />);
    const start = screen.getByRole('button', { name: /start exam in exam app/i });
    expect((start as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox'));
    expect((start as HTMLButtonElement).disabled).toBe(true);
    await enterCaptcha();
    expect((start as HTMLButtonElement).disabled).toBe(false);
  });

  it('asks for a one-time launch token and opens the app with it, never a password', async () => {
    createExamLaunch.mockResolvedValue({ token: TOKEN, expiresInSeconds: 120 });
    render(<OpenInExamApp examId={ID} resuming={false} />);

    fireEvent.click(screen.getByRole('checkbox'));
    await enterCaptcha();
    fireEvent.click(screen.getByRole('button', { name: /start exam in exam app/i }));

    await waitFor(() => expect(window.location.href).toBe(`secure-exam://launch/${TOKEN}`));
    expect(createExamLaunch).toHaveBeenCalledWith(ID, { captchaId: 'captcha-1', captchaAnswer: 'abc23' });
  });

  it('uses the replacement challenge after a wrong answer and requires fresh input', async () => {
    createExamLaunch.mockRejectedValue({ response: { status: 400, data: { message: 'Try again', captcha: { captchaId: 'replacement', svg: '<svg>new</svg>' } } } });
    render(<OpenInExamApp examId={ID} resuming />);
    await enterCaptcha();
    fireEvent.click(screen.getByRole('button', { name: /resume in exam app/i }));
    await screen.findByText('Try again');
    expect((screen.getByLabelText('Enter the characters in the image') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: /resume in exam app/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(createCaptcha).toHaveBeenCalledTimes(1);
  });

  it('resuming needs no checkbox', async () => {
    createExamLaunch.mockResolvedValue({ token: TOKEN, expiresInSeconds: 120 });
    render(<OpenInExamApp examId={ID} resuming />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    await enterCaptcha();
    fireEvent.click(screen.getByRole('button', { name: /resume in exam app/i }));
    await waitFor(() => expect(window.location.href).toContain('secure-exam://launch/'));
  });

  it('shows the problem and stays on the page when the token cannot be created', async () => {
    createExamLaunch.mockRejectedValue({ response: { status: 500, data: { message: 'Server error' } } });
    render(<OpenInExamApp examId={ID} resuming />);

    await enterCaptcha();
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
