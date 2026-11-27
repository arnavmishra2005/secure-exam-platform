import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown } from './format';
import { useNow } from './useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a countdown running without a refetch', () => {
    const { result } = renderHook(() => formatCountdown('2026-11-27T10:05:00Z', useNow()));
    expect(result.current).toBe('in 5m 00s');

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe('in 4m 57s');
  });

  it('ticks every second even when the exam is hours away', () => {
    const { result } = renderHook(() => formatCountdown('2026-11-27T12:15:00Z', useNow()));
    expect(result.current).toBe('in 2h 15m 00s');

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe('in 2h 14m 59s');
  });

  it('stops ticking when unmounted', () => {
    const { unmount } = renderHook(() => useNow());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('formatCountdown', () => {
  const now = Date.parse('2026-11-27T10:00:00Z');
  it.each([
    ['2026-11-29T13:05:09Z', 'in 2d 03h 05m 09s'],
    ['2026-11-27T11:00:00Z', 'in 1h 00m 00s'],
    ['2026-11-27T10:00:42Z', 'in 42s'],
    ['2026-11-27T10:00:00Z', 'now'],
    ['2026-11-27T09:59:00Z', 'now'],
  ])('%s → %s', (iso, expected) => {
    expect(formatCountdown(iso, now)).toBe(expected);
  });
});
