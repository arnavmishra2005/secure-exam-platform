import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it } from 'vitest';
import { createIndexedDbStore } from '../indexedDbStore';
import { describeOfflineStoreContract } from './offlineStore.contract';

// A fresh, empty IndexedDB for every test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describeOfflineStoreContract('IndexedDB store', () => createIndexedDbStore());

it('keeps pending answers and the submit intent across a page reload', async () => {
  const beforeReload = createIndexedDbStore();
  await beforeReload.saveAnswer('attempt-1', 'q1', { selectedOptionIds: ['a'] });
  await beforeReload.saveSubmitIntent('attempt-1');

  const afterReload = createIndexedDbStore(); // a new connection to the same database
  expect(await afterReload.getPendingAnswers('attempt-1')).toMatchObject([
    { questionId: 'q1', payload: { selectedOptionIds: ['a'] }, status: 'pending' },
  ]);
  expect(await afterReload.getSubmitIntent('attempt-1')).toMatchObject({ attemptId: 'attempt-1' });
});
