// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { configurePersistence, saveAnswer } from '../../persistence';
import { createMemoryStore } from '../../persistence/memoryStore';
import { useNetworkStatus } from '../useNetworkStatus';
import { useSyncStatus } from '../useSyncStatus';

configurePersistence({
  store: createMemoryStore(),
  api: { saveAnswer: vi.fn().mockResolvedValue({}), submitAttempt: vi.fn().mockResolvedValue({}) },
  ping: () => Promise.resolve(true),
});

it('useNetworkStatus follows the browser going offline and back online', async () => {
  const { result } = renderHook(() => useNetworkStatus());
  expect(result.current).toBe('online');

  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
  expect(result.current).toBe('offline');

  act(() => {
    window.dispatchEvent(new Event('online'));
  });
  await waitFor(() => expect(result.current).toBe('online'));
});

it('useSyncStatus reports an answer saved through saveAnswer() once it has synced', async () => {
  const { result } = renderHook(() => useSyncStatus((state) => state.answers.q1));
  expect(result.current).toBeUndefined();

  await act(() => saveAnswer('attempt-1', 'q1', { selectedOptionIds: ['a'] }));

  await waitFor(() => expect(result.current).toBe('synced'));
});
