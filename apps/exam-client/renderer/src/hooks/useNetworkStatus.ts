import { useStore } from 'zustand';
import type { NetworkStatus } from '../persistence';
import { getSyncStore } from '../store/syncStore';

/**
 * 'online' or 'offline': navigator.onLine plus a periodic backend ping.
 * TODO(Person A): render this in NetworkStatusBadge.
 */
export function useNetworkStatus(): NetworkStatus {
  return useStore(getSyncStore(), (state) => state.network);
}
