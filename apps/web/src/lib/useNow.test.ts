import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelative } from './format';
import { useNow } from './useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a countdown running without a refetch', () => {
    const start = '2026-11-27T10:05:00Z';
    const { result } = renderHook(() => formatRelative(start, useNow()));
    expect(result.current).toBe('in 5m 00s');

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe('in 4m 57s');
  });

  it('stops ticking when unmounted', () => {
    const { unmount } = renderHook(() => useNow());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
