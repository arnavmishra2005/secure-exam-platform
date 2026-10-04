import { createStore, type StoreApi } from 'zustand/vanilla';
import { getNetworkMonitor, getSyncEngine, type NetworkStatus, type SyncStatus } from '../persistence';
import type { NetworkMonitor } from '../persistence/networkStatus';
import type { SyncEngine } from '../persistence/syncEngine';

export interface SyncStoreState extends SyncStatus {
  network: NetworkStatus;
}

/**
 * Zustand mirror of the sync engine and network monitor, for the UI: per-answer
 * sync status for B's palette, submission state for B's confirmation modal, and
 * network status for A's badge.
 */
export function createSyncStore(
  engine: Pick<SyncEngine, 'getStatus' | 'subscribe'>,
  network: Pick<NetworkMonitor, 'getStatus' | 'subscribe'>,
): StoreApi<SyncStoreState> {
  const store = createStore<SyncStoreState>(() => ({ ...engine.getStatus(), network: network.getStatus() }));
  engine.subscribe((status) => store.setState(status));
  network.subscribe((status) => store.setState({ network: status }));
  return store;
}

let syncStore: StoreApi<SyncStoreState> | undefined;

/** The app-wide store, connected to the persistence layer on first use. */
export function getSyncStore(): StoreApi<SyncStoreState> {
  syncStore ??= createSyncStore(getSyncEngine(), getNetworkMonitor());
  return syncStore;
}
