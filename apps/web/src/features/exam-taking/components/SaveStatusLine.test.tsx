import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveStatusLine } from './SaveStatusLine';

describe('SaveStatusLine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is the same single line whether saved, saving or warning, so the page does not move', () => {
    const { container, rerender } = render(<SaveStatusLine unsavedCount={0} warnAfterMs={3000} />);
    const line = () => container.firstElementChild as HTMLElement;
    const shape = () => [line().tagName, line().className.split(/\s+/).filter((c) => c === 'h-6' || c === 'flex').sort().join(' ')];
    const saved = shape();
    expect(screen.getByText('All changes saved to the server.')).toBeTruthy();

    rerender(<SaveStatusLine unsavedCount={1} warnAfterMs={3000} />);
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(shape()).toEqual(saved);

    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText(/1 unsaved answer\(s\)/)).toBeTruthy();
    expect(shape()).toEqual(saved);
    expect(container.querySelectorAll('[role="status"], [role="alert"]')).toHaveLength(0);
  });

  it('does not warn while answers save quickly, and resets once everything is saved', () => {
    const { rerender } = render(<SaveStatusLine unsavedCount={2} warnAfterMs={3000} />);
    act(() => void vi.advanceTimersByTime(2000));
    rerender(<SaveStatusLine unsavedCount={0} warnAfterMs={3000} />);
    expect(screen.getByText('All changes saved to the server.')).toBeTruthy();
    rerender(<SaveStatusLine unsavedCount={1} warnAfterMs={3000} />);
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByText('Saving…')).toBeTruthy();
  });
});
