import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sendHeartbeat = vi.fn();
vi.mock('@secure-exam/api-client', () => ({ sendHeartbeat: (...args: unknown[]) => sendHeartbeat(...args) }));

import { computeClockOffset, useServerClock } from '../useServerClock';

describe('computeClockOffset', () => {
  it('measures server time against the middle of the round trip', () => {
    // Sent at 1000, answered at 1200 (device clock); the server said 5100.
    expect(computeClockOffset(1_000, 1_200, new Date(5_100).toISOString())).toBe(4_000);
  });

  it('is negative when the device clock runs ahead', () => {
    expect(computeClockOffset(10_000, 10_000, new Date(7_000).toISOString())).toBe(-3_000);
  });
});

describe('useServerClock', () => {
  afterEach(() => {
    vi.useRealTimers();
    sendHeartbeat.mockReset();
  });

  it('picks up a new expiry (a time extension) on the next heartbeat', async () => {
    vi.useFakeTimers();
    const serverTime = () => new Date(Date.now()).toISOString();
    sendHeartbeat
      .mockImplementationOnce(async () => ({ serverTime: serverTime(), expiresAt: '2026-01-01T10:30:00.000Z', remainingSeconds: 1, status: 'IN_PROGRESS' }))
      .mockImplementation(async () => ({ serverTime: serverTime(), expiresAt: '2026-01-01T10:40:00.000Z', remainingSeconds: 1, status: 'IN_PROGRESS' }));

    const { result } = renderHook(() => useServerClock('attempt-1', 15_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current?.expiresAt).toBe('2026-01-01T10:30:00.000Z');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(result.current?.expiresAt).toBe('2026-01-01T10:40:00.000Z');
    expect(sendHeartbeat).toHaveBeenCalledWith('attempt-1');
  });

  it('does nothing without an attempt', () => {
    const { result } = renderHook(() => useServerClock(null));
    expect(result.current).toBeNull();
    expect(sendHeartbeat).not.toHaveBeenCalled();
  });
});
