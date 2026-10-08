import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IOfflineStore } from '../offlineStore.interface';

const ATTEMPT = 'attempt-1';

/** Behaviour every IOfflineStore must share: in-memory and IndexedDB now, SQLite in Phase 4. */
export function describeOfflineStoreContract(name: string, createStore: () => IOfflineStore): void {
  describe(`${name}: IOfflineStore contract`, () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('saves an answer locally as pending and reads it back', async () => {
      const store = createStore();
      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });

      expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({
        attemptId: ATTEMPT,
        questionId: 'q1',
        payload: { selectedOptionIds: ['a'] },
        revision: 1,
        status: 'pending',
      });
      expect(await store.getAnswer(ATTEMPT, 'q2')).toBeNull();
    });

    it('merges unsynced edits using the Answer API rules, so one request carries them all', async () => {
      const store = createStore();
      const payload = async () => (await store.getAnswer(ATTEMPT, 'q1'))?.payload;

      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
      await store.saveAnswer(ATTEMPT, 'q1', { markedForReview: true });
      expect(await payload()).toEqual({ selectedOptionIds: ['a'], markedForReview: true });

      // Clearing wipes the content but keeps the review flag, as the server does.
      await store.saveAnswer(ATTEMPT, 'q1', { clearResponse: true });
      expect(await payload()).toEqual({ clearResponse: true, markedForReview: true });

      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['b'] });
      expect(await payload()).toEqual({ selectedOptionIds: ['b'], markedForReview: true });
    });

    it("lists only this attempt's pending answers, oldest edit first", async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const store = createStore();
      vi.setSystemTime(1_000);
      await store.saveAnswer(ATTEMPT, 'q2', { selectedOptionIds: ['a'] });
      vi.setSystemTime(2_000);
      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['b'] });
      await store.saveAnswer('other-attempt', 'q1', { selectedOptionIds: ['c'] });

      const pending = await store.getPendingAnswers(ATTEMPT);
      expect(pending.map((answer) => answer.questionId)).toEqual(['q2', 'q1']);
    });

    it("lists all of this attempt's answers, synced or not", async () => {
      const store = createStore();
      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
      await store.saveAnswer(ATTEMPT, 'q2', { markedForReview: true });
      await store.saveAnswer('other-attempt', 'q1', { selectedOptionIds: ['c'] });
      await store.markSynced(ATTEMPT, 'q1', 1);

      const all = await store.getAllAnswers(ATTEMPT);
      expect(all.map((answer) => [answer.questionId, answer.status]).sort()).toEqual([
        ['q1', 'synced'],
        ['q2', 'pending'],
      ]);
      expect(await store.getAllAnswers('no-such-attempt')).toEqual([]);
    });

    it('marks the sent revision synced, but not an edit made while it was in flight', async () => {
      const store = createStore();
      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] }); // revision 1 is sent...
      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['b'] }); // ...then edited before the reply

      expect(await store.markSynced(ATTEMPT, 'q1', 1)).toBe(false);
      expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({ revision: 2, status: 'pending' });

      expect(await store.markSynced(ATTEMPT, 'q1', 2)).toBe(true);
      expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({ status: 'synced' });
      expect(await store.getPendingAnswers(ATTEMPT)).toEqual([]);
    });

    it('keeps a refused answer as failed, and queues it again when edited', async () => {
      const store = createStore();
      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });

      expect(await store.markFailed(ATTEMPT, 'q1', 1, 'Selected option(s) do not belong to this question')).toBe(true);
      expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({
        status: 'failed',
        error: 'Selected option(s) do not belong to this question',
      });
      expect(await store.getPendingAnswers(ATTEMPT)).toEqual([]);

      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['b'] });
      expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({ revision: 2, status: 'pending' });
    });

    it('stores, reads and clears a submit intent', async () => {
      const store = createStore();
      expect(await store.getSubmitIntent(ATTEMPT)).toBeNull();

      await store.saveSubmitIntent(ATTEMPT);
      expect(await store.getSubmitIntent(ATTEMPT)).toMatchObject({ attemptId: ATTEMPT });

      await store.clearSubmitIntent(ATTEMPT);
      expect(await store.getSubmitIntent(ATTEMPT)).toBeNull();
    });
  });
}
