// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createNetworkMonitor, type NetworkMonitor, type NetworkStatus } from '../networkStatus';

let monitor: NetworkMonitor | undefined;

afterEach(() => {
  monitor?.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('starts from navigator.onLine and follows the browser offline/online events', async () => {
  const ping = vi.fn().mockResolvedValue(true);
  monitor = createNetworkMonitor({ ping });
  monitor.start();
  const seen: NetworkStatus[] = [];
  monitor.subscribe((status) => seen.push(status));
  expect(monitor.getStatus()).toBe('online');

  window.dispatchEvent(new Event('offline'));
  expect(monitor.getStatus()).toBe('offline');

  window.dispatchEvent(new Event('online')); // confirmed with a backend ping before it counts
  await vi.waitFor(() => expect(monitor?.getStatus()).toBe('online'));
  expect(ping).toHaveBeenCalledTimes(1);
  expect(seen).toEqual(['offline', 'online']);
});

it('reports offline when the backend ping fails, even though navigator.onLine is true', async () => {
  const ping = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue(true);
  monitor = createNetworkMonitor({ ping });

  expect(await monitor.check()).toBe('offline');
  expect(await monitor.check()).toBe('offline');
  expect(await monitor.check()).toBe('online');
});

it('reports offline without pinging when navigator.onLine is false', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const ping = vi.fn().mockResolvedValue(true);
  monitor = createNetworkMonitor({ ping });

  expect(monitor.getStatus()).toBe('offline');
  expect(await monitor.check()).toBe('offline');
  expect(ping).not.toHaveBeenCalled();
});

it('pings the backend periodically', async () => {
  vi.useFakeTimers();
  const ping = vi.fn().mockResolvedValue(false);
  monitor = createNetworkMonitor({ ping, intervalMs: 30_000 });
  monitor.start();

  await vi.advanceTimersByTimeAsync(29_999);
  expect(ping).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(ping).toHaveBeenCalledTimes(1);
  expect(monitor.getStatus()).toBe('offline');
});
