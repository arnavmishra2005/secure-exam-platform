import type { DesktopSecurityEvent } from '@secure-exam/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSecurityQueue } from './flushSecurityQueue';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

const event = (detail: string, type: DesktopSecurityEvent['type'] = 'BLOCKED_SHORTCUT'): DesktopSecurityEvent => ({
  type,
  detail,
  ts: Date.UTC(2026, 9, 21, 10, 0, 0),
});

describe('flushSecurityQueue', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('sends what the exam app recorded, with ISO times, and leaves nothing waiting', async () => {
    const send = vi.fn().mockResolvedValue({ recorded: 2 });
    const left = await flushSecurityQueue({
      attemptId: 'a1',
      drain: async () => [event('Cmd+R'), event('Ctrl+Q')],
      send,
      storage,
    });

    expect(left).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('a1', [
      { type: 'BLOCKED_SHORTCUT', detail: 'Cmd+R', occurredAt: '2026-10-21T10:00:00.000Z' },
      { type: 'BLOCKED_SHORTCUT', detail: 'Ctrl+Q', occurredAt: '2026-10-21T10:00:00.000Z' },
    ]);
    expect(storage.getItem('exam:securityQueue:a1')).toBeNull();
  });

  it('does nothing when there is nothing to report', async () => {
    const send = vi.fn();
    await expect(flushSecurityQueue({ attemptId: 'a1', drain: async () => [], send, storage })).resolves.toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps the events when the API cannot be reached, and sends them on the next try', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ recorded: 1 });

    const left = await flushSecurityQueue({ attemptId: 'a1', drain: async () => [event('Cmd+R')], send, storage });
    expect(left).toBe(1);
    expect(storage.getItem('exam:securityQueue:a1')).toContain('Cmd+R');

    // Nothing new this time: the saved event is still sent.
    const after = await flushSecurityQueue({ attemptId: 'a1', drain: async () => [], send, storage });
    expect(after).toBe(0);
    expect(send).toHaveBeenLastCalledWith('a1', [expect.objectContaining({ detail: 'Cmd+R' })]);
    expect(storage.getItem('exam:securityQueue:a1')).toBeNull();
  });

  it('survives a page reload: events saved by the previous page are sent by the next one', async () => {
    const down = vi.fn().mockRejectedValue(new Error('offline'));
    await flushSecurityQueue({ attemptId: 'a1', drain: async () => [event('Cmd+W')], send: down, storage });

    const send = vi.fn().mockResolvedValue({ recorded: 2 });
    await flushSecurityQueue({ attemptId: 'a1', drain: async () => [event('Cmd+Q')], send, storage });
    expect(send.mock.calls[0][1].map((e: { detail: string }) => e.detail)).toEqual(['Cmd+W', 'Cmd+Q']);
  });

  it('sends in batches of 50', async () => {
    const send = vi.fn().mockResolvedValue({});
    const many = Array.from({ length: 120 }, (_, i) => event(`k${i}`));
    await flushSecurityQueue({ attemptId: 'a1', drain: async () => many, send, storage });
    expect(send.mock.calls.map((c) => c[1].length)).toEqual([50, 50, 20]);
  });

  it('keeps unsent batches when a later batch fails', async () => {
    const send = vi.fn().mockResolvedValueOnce({}).mockRejectedValue(new Error('offline'));
    const many = Array.from({ length: 120 }, (_, i) => event(`k${i}`));
    const left = await flushSecurityQueue({ attemptId: 'a1', drain: async () => many, send, storage });
    expect(left).toBe(70);
  });

  it('does not lose events when the bridge or storage is unavailable', async () => {
    const send = vi.fn().mockResolvedValue({});
    await expect(
      flushSecurityQueue({ attemptId: 'a1', drain: async () => [event('F5')], send, storage: null }),
    ).resolves.toBe(0);
    expect(send).toHaveBeenCalledTimes(1);

    const broken = vi.fn().mockRejectedValue(new Error('ipc closed'));
    await expect(flushSecurityQueue({ attemptId: 'a1', drain: broken, send, storage })).resolves.toBe(0);
  });
});
