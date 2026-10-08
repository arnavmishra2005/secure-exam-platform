import { useStore } from 'zustand';
import { getSyncStore, type SyncStoreState } from '../store/syncStore';

/**
 * Sync state for the UI: per-answer status (`answers[questionId]`), `submit`
 * ('pending' means "submission pending: reconnect to finish"), `attemptClosed`
 * and `needsAuth`. Pass a selector to re-render only when that part changes.
 * Used by ExamPage (palette, submit modal), NetworkStatusBadge and SubmittedPage.
 */
export function useSyncStatus(): SyncStoreState;
export function useSyncStatus<T>(selector: (state: SyncStoreState) => T): T;
export function useSyncStatus(selector: (state: SyncStoreState) => unknown = (state) => state): unknown {
  return useStore(getSyncStore(), selector);
}
