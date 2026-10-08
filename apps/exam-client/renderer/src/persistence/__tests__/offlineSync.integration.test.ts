// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { configurePersistence, getOfflineStore, getSyncEngine, requestSubmit, saveAnswer, startSync } from '../index';
import { createIndexedDbStore } from '../indexedDbStore';

// The real wiring (B's seams, default IndexedDB store, network monitor on browser
// events, sync engine), with only the Phase 1 API and the backend ping faked.
const ATTEMPT = 'attempt-1';
const api = { saveAnswer: vi.fn().mockResolvedValue({}), submitAttempt: vi.fn().mockResolvedValue({}) };
let backendReachable = true;
configurePersistence({ api, ping: () => Promise.resolve(backendReachable) });

it('stores answers and a submission made offline in IndexedDB, and syncs them in order once back online', async () => {
  await startSync(ATTEMPT);
  backendReachable = false;
  window.dispatchEvent(new Event('offline'));

  await saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
  await saveAnswer(ATTEMPT, 'q2', { markedForReview: true });
  await saveAnswer(ATTEMPT, 'q1', { markedForReview: true });
  expect(await requestSubmit(ATTEMPT)).toBe('pending'); // "submission pending: reconnect to finish"

  expect(api.saveAnswer).not.toHaveBeenCalled();
  expect(api.submitAttempt).not.toHaveBeenCalled();
  const indexedDb = createIndexedDbStore(); // a second connection: the data really is in IndexedDB
  expect(await indexedDb.getPendingAnswers(ATTEMPT)).toHaveLength(2);
  expect(await indexedDb.getSubmitIntent(ATTEMPT)).not.toBeNull();

  backendReachable = true;
  window.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(getSyncEngine().getStatus().submit).toBe('submitted'));

  expect(api.saveAnswer).toHaveBeenCalledTimes(2);
  expect(api.saveAnswer).toHaveBeenCalledWith(ATTEMPT, 'q1', { selectedOptionIds: ['a'], markedForReview: true });
  expect(api.saveAnswer).toHaveBeenCalledWith(ATTEMPT, 'q2', { markedForReview: true });
  expect(api.submitAttempt.mock.invocationCallOrder[0]).toBeGreaterThan(
    Math.max(...api.saveAnswer.mock.invocationCallOrder),
  );
  expect(await getOfflineStore().getPendingAnswers(ATTEMPT)).toEqual([]);
  expect(await getOfflineStore().getSubmitIntent(ATTEMPT)).toBeNull();
});
