import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DesktopOnly } from './DesktopOnly';
import { OpenInExamApp } from './OpenInExamApp';

const ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  delete (window as { desktop?: unknown }).desktop;
});

describe('OpenInExamApp', () => {
  it('links to the exam app with the exam id', () => {
    render(<OpenInExamApp examId={ID} resuming={false} />);
    expect(screen.getByRole('link', { name: /open in exam app/i }).getAttribute('href')).toBe(`secure-exam://exam/${ID}`);
  });

  it('says resume when an attempt is already running', () => {
    render(<OpenInExamApp examId={ID} resuming />);
    expect(screen.getByRole('link', { name: /resume in exam app/i })).toBeTruthy();
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
