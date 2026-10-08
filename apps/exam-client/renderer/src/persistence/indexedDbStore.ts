import { openDB, type DBSchema } from 'idb';
import type { IOfflineStore, LocalAnswer, SubmitIntent } from './offlineStore.interface';
import { applyEdit, applyFailed, applySynced, pendingInOrder } from './syncQueue';

interface OfflineDb extends DBSchema {
  answers: { key: [string, string]; value: LocalAnswer; indexes: { byAttempt: string } };
  submitIntents: { key: string; value: SubmitIntent };
}

/** Browser IOfflineStore backed by IndexedDB. Answers survive reloads and crashes. */
export function createIndexedDbStore(dbName = 'secure-exam-offline'): IOfflineStore {
  const db = openDB<OfflineDb>(dbName, 1, {
    upgrade(database) {
      database.createObjectStore('answers', { keyPath: ['attemptId', 'questionId'] }).createIndex('byAttempt', 'attemptId');
      database.createObjectStore('submitIntents', { keyPath: 'attemptId' });
    },
  });

  // Read-modify-write in one transaction. Only IndexedDB calls may be awaited
  // inside it, or it commits early. Strict durability means the answer is on
  // disk before the save resolves (where the browser supports the option).
  async function updateAnswer(
    attemptId: string,
    questionId: string,
    change: (existing: LocalAnswer | undefined) => LocalAnswer | null,
  ): Promise<boolean> {
    const tx = (await db).transaction('answers', 'readwrite', { durability: 'strict' });
    const next = change(await tx.store.get([attemptId, questionId]));
    if (next) await tx.store.put(next);
    await tx.done;
    return next !== null;
  }

  return {
    async saveAnswer(attemptId, questionId, update) {
      await updateAnswer(attemptId, questionId, (existing) => applyEdit(existing, attemptId, questionId, update));
    },
    async getAnswer(attemptId, questionId) {
      return (await (await db).get('answers', [attemptId, questionId])) ?? null;
    },
    async getAllAnswers(attemptId) {
      return (await db).getAllFromIndex('answers', 'byAttempt', attemptId);
    },
    async getPendingAnswers(attemptId) {
      return pendingInOrder(await (await db).getAllFromIndex('answers', 'byAttempt', attemptId));
    },
    markSynced(attemptId, questionId, revision) {
      return updateAnswer(attemptId, questionId, (existing) => applySynced(existing, revision));
    },
    markFailed(attemptId, questionId, revision, error) {
      return updateAnswer(attemptId, questionId, (existing) => applyFailed(existing, revision, error));
    },
    async saveSubmitIntent(attemptId) {
      await (await db).put('submitIntents', { attemptId, requestedAt: Date.now() });
    },
    async getSubmitIntent(attemptId) {
      return (await (await db).get('submitIntents', attemptId)) ?? null;
    },
    async clearSubmitIntent(attemptId) {
      await (await db).delete('submitIntents', attemptId);
    },
  };
}
