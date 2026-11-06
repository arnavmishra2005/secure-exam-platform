import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DesktopSecurityEvent } from '@secure-exam/types';

const flush = vi.hoisted(() => vi.fn().mockResolvedValue(0));
vi.mock('./flushSecurityQueue', () => ({ flushSecurityQueue: flush }));
vi.mock('@secure-exam/api-client', () => ({ reportSecurityEvents: vi.fn() }));
import { useSecurityReporter } from './useSecurityReporter';

afterEach(() => {
  vi.useRealTimers();
  delete window.desktop;
  flush.mockClear();
});

it('keeps ordinary violations open and flushes the interruption event before closing', async () => {
  vi.useFakeTimers();
  let receive!: (event: DesktopSecurityEvent) => void;
  const exit = vi.fn().mockResolvedValue({ ok: true });
  const unsubscribe = vi.fn();
  (window as { desktop?: unknown }).desktop = {
    isDesktop: () => true,
    drainEvents: vi.fn().mockResolvedValue([]),
    exitKiosk: exit,
    onSecurityEvent: (listener: typeof receive) => { receive = listener; return unsubscribe; },
  };
  const hook = renderHook(() => useSecurityReporter('attempt-1'));
  await act(async () => {});
  const event = (detail: string): DesktopSecurityEvent => ({ type: 'BLOCKED_SHORTCUT', detail, ts: Date.now() });
  act(() => receive(event('Alt+Tab blocked during exam')));
  await act(() => vi.advanceTimersByTimeAsync(2100));
  expect(exit).not.toHaveBeenCalled();
  const count = flush.mock.calls.length;
  act(() => receive(event('Ctrl+Alt+Delete: exam interrupted; invigilator approval is required to resume.')));
  expect(exit).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(2100));
  expect(flush.mock.calls.length).toBeGreaterThan(count);
  expect(exit).toHaveBeenCalledOnce();
  hook.unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
