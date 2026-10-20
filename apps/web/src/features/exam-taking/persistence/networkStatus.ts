export type NetworkStatus = 'online' | 'offline';

export interface NetworkMonitor {
  getStatus(): NetworkStatus;
  subscribe(listener: (status: NetworkStatus) => void): () => void;
  /** Checks reachability now. */
  check(): Promise<NetworkStatus>;
  start(): void;
  stop(): void;
}

export interface NetworkMonitorOptions {
  /** True if the backend answered. */
  ping: () => Promise<boolean>;
  intervalMs?: number;
}

/**
 * navigator.onLine and its online/offline events, plus a periodic backend ping.
 * navigator.onLine alone only knows there is a network connection, not whether
 * the API is reachable over it.
 */
export function createNetworkMonitor({ ping, intervalMs = 30_000 }: NetworkMonitorOptions): NetworkMonitor {
  const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
  const listeners = new Set<(status: NetworkStatus) => void>();
  let status: NetworkStatus = browserOnline() ? 'online' : 'offline';
  let timer: ReturnType<typeof setInterval> | undefined;

  function set(next: NetworkStatus): void {
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener(next);
  }

  async function check(): Promise<NetworkStatus> {
    const reachable = browserOnline() && (await ping().catch(() => false));
    // The browser may have gone offline while the ping was in flight.
    set(reachable && browserOnline() ? 'online' : 'offline');
    return status;
  }

  const onOnline = () => void check();
  const onOffline = () => set('offline');

  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    check,
    start() {
      if (timer) return;
      if (typeof window !== 'undefined') {
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
      }
      timer = setInterval(() => void check(), intervalMs);
    },
    stop() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      }
      clearInterval(timer);
      timer = undefined;
    },
  };
}
