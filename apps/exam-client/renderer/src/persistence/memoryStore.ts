import type { IOfflineStore, LocalAnswer, SubmitIntent } from './offlineStore.interface';
import { applyEdit, applyFailed, applySynced, pendingInOrder } from './syncQueue';

/**
 * In-memory IOfflineStore: the stub the plan has C publish first so B can code
 * against the interface, and the fallback where IndexedDB is unavailable.
 * Nothing survives a page reload. Reads return copies, as IndexedDB does.
 */
export function createMemoryStore(): IOfflineStore {
  const answers = new Map<string, LocalAnswer>();
  const intents = new Map<string, SubmitIntent>();
  const key = (attemptId: string, questionId: string) => `${attemptId}/${questionId}`;

  const forAttempt = (attemptId: string) => [...answers.values()].filter((answer) => answer.attemptId === attemptId);

  function replace(attemptId: string, questionId: string, next: LocalAnswer | null): boolean {
    if (next) answers.set(key(attemptId, questionId), next);
    return next !== null;
  }

  return {
    async saveAnswer(attemptId, questionId, update) {
      replace(attemptId, questionId, applyEdit(answers.get(key(attemptId, questionId)), attemptId, questionId, update));
    },
    async getAnswer(attemptId, questionId) {
      const answer = answers.get(key(attemptId, questionId));
      return answer ? structuredClone(answer) : null;
    },
    async getAllAnswers(attemptId) {
      return forAttempt(attemptId).map((answer) => structuredClone(answer));
    },
    async getPendingAnswers(attemptId) {
      return pendingInOrder(forAttempt(attemptId)).map((answer) => structuredClone(answer));
    },
    async markSynced(attemptId, questionId, revision) {
      return replace(attemptId, questionId, applySynced(answers.get(key(attemptId, questionId)), revision));
    },
    async markFailed(attemptId, questionId, revision, error) {
      return replace(attemptId, questionId, applyFailed(answers.get(key(attemptId, questionId)), revision, error));
    },
    async saveSubmitIntent(attemptId) {
      intents.set(attemptId, { attemptId, requestedAt: Date.now() });
    },
    async getSubmitIntent(attemptId) {
      const intent = intents.get(attemptId);
      return intent ? structuredClone(intent) : null;
    },
    async clearSubmitIntent(attemptId) {
      intents.delete(attemptId);
    },
  };
}
