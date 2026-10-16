import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedDraft } from '../coding/hooks/useDebouncedDraft';

describe('useDebouncedDraft', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not save the initial value', () => {
    const save = vi.fn();
    renderHook(() => useDebouncedDraft('start', save, 1000));
    act(() => void vi.advanceTimersByTime(5000));
    expect(save).not.toHaveBeenCalled();
  });

  it('saves once after the value stops changing', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useDebouncedDraft(v, save, 1000), { initialProps: { v: 'a' } });
    rerender({ v: 'ab' });
    act(() => void vi.advanceTimersByTime(500));
    rerender({ v: 'abc' });
    expect(result.current.status).toBe('pending');
    act(() => void vi.advanceTimersByTime(999));
    expect(save).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(1));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('abc');
    expect(result.current.status).toBe('saved');
  });

  it('flushes a pending change on unmount', () => {
    const save = vi.fn();
    const { rerender, unmount } = renderHook(({ v }) => useDebouncedDraft(v, save, 1000), { initialProps: { v: 'a' } });
    rerender({ v: 'changed' });
    unmount();
    expect(save).toHaveBeenCalledWith('changed');
  });

  it('reports a failed save and retries on the next change', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useDebouncedDraft(v, save, 100), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    await act(async () => void vi.advanceTimersByTime(100));
    expect(result.current.status).toBe('error');
    rerender({ v: 'bc' });
    await act(async () => void vi.advanceTimersByTime(100));
    expect(save).toHaveBeenLastCalledWith('bc');
    expect(result.current.status).toBe('saved');
  });
});
