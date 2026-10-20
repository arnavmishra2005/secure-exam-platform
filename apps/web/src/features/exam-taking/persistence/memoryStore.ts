import type {
  CodeDraft,
  ICodeDraftStore,
  IEventQueueStore,
  IOfflineStore,
  LocalAnswer,
  QueuedEvent,
  SubmitIntent,
} from './offlineStore.interface';
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
    ...createMemoryDraftAndEventStore(),
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

/**
 * In-memory code drafts (Person B) and event queue (Person C), the v2 parts
 * of IOfflineStore. The IndexedDB store borrows these until its own
 * implementations land (B: Day 3, C: Day 5).
 */
export function createMemoryDraftAndEventStore(): ICodeDraftStore & IEventQueueStore {
  const drafts = new Map<string, CodeDraft>();
  const events: QueuedEvent[] = [];
  const key = (attemptId: string, questionId: string) => `${attemptId}/${questionId}`;

  return {
    async saveCodeDraft(draft) {
      drafts.set(key(draft.attemptId, draft.questionId), { ...draft, updatedAt: Date.now() });
    },
    async getCodeDraft(attemptId, questionId) {
      const draft = drafts.get(key(attemptId, questionId));
      return draft ? structuredClone(draft) : null;
    },
    async getAllCodeDrafts(attemptId) {
      return [...drafts.values()].filter((d) => d.attemptId === attemptId).map((d) => structuredClone(d));
    },
    async queueEvent(event) {
      const queued: QueuedEvent = { ...structuredClone(event), id: crypto.randomUUID() };
      events.push(queued);
      return structuredClone(queued);
    },
    async getQueuedEvents(attemptId, limit = Infinity) {
      return events
        .filter((e) => e.attemptId === attemptId)
        .sort((a, b) => a.occurredAt - b.occurredAt)
        .slice(0, limit)
        .map((e) => structuredClone(e));
    },
    async removeEvents(ids) {
      const remove = new Set(ids);
      for (let i = events.length - 1; i >= 0; i--) {
        if (remove.has(events[i].id)) events.splice(i, 1);
      }
    },
  };
}
