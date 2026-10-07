// Person C's persistence layer. The UI reads and writes answers only through
// this module: B's useAnswer() calls saveAnswer(), and ExamPage's submit and
// timer-expiry handlers call requestSubmit(). Framework-agnostic; the React
// bindings are store/syncStore.ts and the hooks.
import { saveAnswer as putAnswer, sendHeartbeat, submitAttempt, type SaveAnswerPayload } from '@secure-exam/api-client';
import { createIndexedDbStore } from './indexedDbStore';
import { createMemoryStore } from './memoryStore';
import { createNetworkMonitor, type NetworkMonitor } from './networkStatus';
import type { IOfflineStore } from './offlineStore.interface';
import { SyncEngine, type SubmitStatus, type SyncApi } from './syncEngine';

export type { AnswerSyncStatus, IOfflineStore, LocalAnswer } from './offlineStore.interface';
export type { NetworkStatus } from './networkStatus';
export type { SubmitStatus, SyncStatus } from './syncEngine';

export interface PersistenceOptions {
  store?: IOfflineStore;
  api?: SyncApi;
  /** Backend reachability check. Defaults to the Phase 1 heartbeat for the current attempt. */
  ping?: () => Promise<boolean>;
  /** See SyncEngineOptions.onUnauthorized. */
  onUnauthorized?: () => void;
}

let options: PersistenceOptions = {};
let offlineStore: IOfflineStore | undefined;
let networkMonitor: NetworkMonitor | undefined;
let syncEngine: SyncEngine | undefined;

/** Overrides the defaults; call before anything else here is used (main.tsx does, at startup). */
export function configurePersistence(overrides: PersistenceOptions): void {
  options = { ...options, ...overrides };
}

/** The plan's factory, and the Phase 4 swap point: Electron returns its SQLite-backed store here. */
export function getOfflineStore(): IOfflineStore {
  offlineStore ??= options.store ?? (typeof indexedDB === 'undefined' ? createMemoryStore() : createIndexedDbStore());
  return offlineStore;
}

export function getNetworkMonitor(): NetworkMonitor {
  if (!networkMonitor) {
    networkMonitor = createNetworkMonitor({ ping: options.ping ?? pingBackend });
    networkMonitor.start();
  }
  return networkMonitor;
}

export function getSyncEngine(): SyncEngine {
  syncEngine ??= new SyncEngine({
    store: getOfflineStore(),
    api: options.api ?? { saveAnswer: putAnswer, submitAttempt },
    network: getNetworkMonitor(),
    onUnauthorized: options.onUnauthorized,
  });
  return syncEngine;
}

/**
 * Saves the answer on this device, then syncs it in the background. `update` is
 * the Phase 1 Answer API request body. Called from B's useAnswer().
 */
export async function saveAnswer(attemptId: string, questionId: string, update: SaveAnswerPayload): Promise<void> {
  await getOfflineStore().saveAnswer(attemptId, questionId, update);
  void getSyncEngine().answerSaved(attemptId, questionId);
}

/**
 * Submits the attempt. Resolves `submitted` once the server has finalized it, or
 * `pending` if it couldn't get there yet; the submission then stays queued and is
 * retried automatically when the connection returns. Called from ExamPage.
 */
export async function requestSubmit(attemptId: string): Promise<SubmitStatus> {
  await getOfflineStore().saveSubmitIntent(attemptId);
  const engine = getSyncEngine();
  await engine.syncNow(attemptId);
  return engine.getStatus().submit;
}

/**
 * Resumes syncing an attempt, e.g. answers or a submission left over from before
 * a reload. Called from AttemptContext once the attempt is loaded.
 */
export function startSync(attemptId: string): Promise<void> {
  return getSyncEngine().syncNow(attemptId);
}

/** Called on logout. Unsynced answers stay stored. */
export function stopSync(): void {
  syncEngine?.stop();
}

/** Any HTTP response, even an error, means the API is reachable. */
async function pingBackend(): Promise<boolean> {
  const attemptId = syncEngine?.getStatus().attemptId;
  if (!attemptId) return true; // nothing to ping without an attempt; navigator.onLine decides
  try {
    await sendHeartbeat(attemptId); // also keeps admin monitoring's lastSeenAt fresh
    return true;
  } catch (err) {
    return (err as { response?: unknown } | undefined)?.response !== undefined;
  }
}
