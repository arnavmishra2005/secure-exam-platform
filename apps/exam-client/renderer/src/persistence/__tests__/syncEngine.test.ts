import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createMemoryStore } from '../memoryStore';
import type { NetworkStatus } from '../networkStatus';
import type { IOfflineStore } from '../offlineStore.interface';
import { classifyFailure, SyncEngine, type SyncApi } from '../syncEngine';

const ATTEMPT = 'attempt-1';

/** Shaped like the axios error api-client throws for an HTTP error response. */
function httpError(status: number, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { response: { status, data: { statusCode: status, message } } });
}

/** Shaped like the axios error for a network failure or timeout: no response. */
const networkError = () => new Error('Network Error');

function fakeNetwork(initial: NetworkStatus = 'online') {
  let status = initial;
  const listeners = new Set<(status: NetworkStatus) => void>();
  return {
    getStatus: () => status,
    subscribe(listener: (status: NetworkStatus) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: NetworkStatus) {
      status = next;
      listeners.forEach((listener) => listener(next));
    },
  };
}

let store: IOfflineStore;
let network: ReturnType<typeof fakeNetwork>;
let api: { saveAnswer: Mock<SyncApi['saveAnswer']>; submitAttempt: Mock<SyncApi['submitAttempt']> };
let onUnauthorized: Mock<() => void>;
let engine: SyncEngine;

beforeEach(() => {
  vi.useFakeTimers();
  store = createMemoryStore();
  network = fakeNetwork();
  api = {
    saveAnswer: vi.fn<SyncApi['saveAnswer']>().mockResolvedValue({}),
    submitAttempt: vi.fn<SyncApi['submitAttempt']>().mockResolvedValue({}),
  };
  onUnauthorized = vi.fn();
  engine = new SyncEngine({ store, api, network, onUnauthorized });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('answers', () => {
  it('pushes a pending answer to the Answer API and marks it synced', async () => {
    await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });

    await engine.syncNow(ATTEMPT);

    expect(api.saveAnswer).toHaveBeenCalledWith(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
    expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({ status: 'synced' });
    expect(engine.getStatus().answers).toEqual({ q1: 'synced' });
  });

  it('does not mark an answer synced if it was edited while the request was in flight', async () => {
    await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
    api.saveAnswer.mockImplementationOnce(async () => {
      await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['b'] }); // the student changes it mid-request
      return {};
    });

    await engine.syncNow(ATTEMPT);

    expect(api.saveAnswer).toHaveBeenCalledTimes(2);
    expect(api.saveAnswer).toHaveBeenLastCalledWith(ATTEMPT, 'q1', { selectedOptionIds: ['b'] });
    expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({ revision: 2, status: 'synced' });
  });

  it('keeps the answer and retries with backoff after network errors, 5xx and 429', async () => {
    await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
    api.saveAnswer
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(429));

    await engine.syncNow(ATTEMPT);
    expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({ status: 'pending' });

    await vi.advanceTimersByTimeAsync(999);
    expect(api.saveAnswer).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // first retry after 1s
    expect(api.saveAnswer).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000); // then 2s
    expect(api.saveAnswer).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4_000); // then 4s
    expect(api.saveAnswer).toHaveBeenCalledTimes(4);
    expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({ status: 'synced' });
  });

  it('marks a refused answer failed without retrying, and carries on with the rest', async () => {
    await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['not-an-option'] });
    await store.saveAnswer(ATTEMPT, 'q2', { selectedOptionIds: ['b'] });
    api.saveAnswer.mockRejectedValueOnce(httpError(400, 'Selected option(s) do not belong to this question: not-an-option'));

    await engine.syncNow(ATTEMPT);

    expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({
      status: 'failed',
      error: 'Selected option(s) do not belong to this question: not-an-option',
    });
    expect(await store.getAnswer(ATTEMPT, 'q2')).toMatchObject({ status: 'synced' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops writing answers once the server says the attempt is expired or submitted', async () => {
    await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
    await store.saveAnswer(ATTEMPT, 'q2', { selectedOptionIds: ['b'] });
    api.saveAnswer.mockRejectedValueOnce(httpError(403, 'This attempt has expired and was automatically submitted'));

    await engine.syncNow(ATTEMPT);

    expect(api.saveAnswer).toHaveBeenCalledTimes(1);
    expect(engine.getStatus()).toMatchObject({ attemptClosed: true, answers: { q1: 'failed', q2: 'failed' } });
    expect(await store.getPendingAnswers(ATTEMPT)).toEqual([]);
  });

  it('waits for a new session after a 401 instead of retrying', async () => {
    await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
    api.saveAnswer.mockRejectedValueOnce(httpError(401, 'Unauthorized'));

    await engine.syncNow(ATTEMPT);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(engine.getStatus().needsAuth).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({ status: 'pending' });

    await engine.syncNow(); // e.g. once Person A's AuthContext has refreshed the session

    expect(await store.getAnswer(ATTEMPT, 'q1')).toMatchObject({ status: 'synced' });
    expect(engine.getStatus().needsAuth).toBe(false);
  });

  it('sends nothing while offline, and flushes when the network comes back', async () => {
    network.set('offline');
    await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });

    await engine.syncNow(ATTEMPT);
    expect(api.saveAnswer).not.toHaveBeenCalled();
    expect(engine.getStatus().answers).toEqual({ q1: 'pending' });

    network.set('online'); // the engine starts syncing on its own...
    await engine.syncNow(); // ...wait for that round to finish

    expect(api.saveAnswer).toHaveBeenCalledTimes(1);
    expect(engine.getStatus().answers).toEqual({ q1: 'synced' });
  });
});

describe('submission', () => {
  it('submits once the pending answers have been pushed', async () => {
    await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
    await store.saveSubmitIntent(ATTEMPT);

    await engine.syncNow(ATTEMPT);

    expect(api.submitAttempt).toHaveBeenCalledWith(ATTEMPT);
    expect(api.submitAttempt.mock.invocationCallOrder[0]).toBeGreaterThan(api.saveAnswer.mock.invocationCallOrder[0]);
    expect(engine.getStatus()).toMatchObject({ submit: 'submitted', attemptClosed: true });
    expect(await store.getSubmitIntent(ATTEMPT)).toBeNull();
  });

  it('holds the submission while an answer still fails to sync', async () => {
    await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['a'] });
    await store.saveSubmitIntent(ATTEMPT);
    api.saveAnswer.mockRejectedValueOnce(httpError(503));

    await engine.syncNow(ATTEMPT);
    expect(api.submitAttempt).not.toHaveBeenCalled();
    expect(engine.getStatus().submit).toBe('pending');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(api.submitAttempt).toHaveBeenCalledTimes(1);
    expect(engine.getStatus().submit).toBe('submitted');
  });

  it('retries after a network error, and treats 409 (already submitted) as done', async () => {
    await store.saveSubmitIntent(ATTEMPT);
    api.submitAttempt
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(httpError(409, 'This attempt has already been submitted'));

    await engine.syncNow(ATTEMPT);
    expect(engine.getStatus().submit).toBe('pending');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(api.submitAttempt).toHaveBeenCalledTimes(2);
    expect(engine.getStatus().submit).toBe('submitted');
    expect(await store.getSubmitIntent(ATTEMPT)).toBeNull();
  });
});

it.each([
  [networkError(), 'retry'],
  [httpError(500), 'retry'],
  [httpError(503), 'retry'],
  [httpError(429), 'retry'],
  [httpError(401), 'unauthorized'],
  [httpError(403), 'closed'],
  [httpError(404), 'closed'],
  [httpError(409), 'closed'],
  [httpError(400), 'rejected'],
])('classifies "%s" as %s', (err, kind) => {
  expect(classifyFailure(err)).toBe(kind);
});
