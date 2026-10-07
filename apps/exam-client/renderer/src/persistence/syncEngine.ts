import type { SaveAnswerPayload } from '@secure-exam/api-client';
import type { NetworkMonitor } from './networkStatus';
import type { AnswerSyncStatus, IOfflineStore, LocalAnswer } from './offlineStore.interface';

/** The Phase 1 api-client calls the engine makes; injected so tests can fake the backend. */
export interface SyncApi {
  saveAnswer(attemptId: string, questionId: string, payload: SaveAnswerPayload): Promise<unknown>;
  submitAttempt(attemptId: string): Promise<unknown>;
}

/** `pending`: requested, not yet confirmed (offline or retrying). `submitted`: the server has finalized the attempt. */
export type SubmitStatus = 'idle' | 'pending' | 'submitted' | 'failed';

export interface SyncStatus {
  attemptId: string | null;
  /** Per questionId, for answers saved or synced during this session. */
  answers: Record<string, AnswerSyncStatus>;
  submit: SubmitStatus;
  syncing: boolean;
  /** The server says the attempt is submitted or expired, so it no longer accepts answers. */
  attemptClosed: boolean;
  /** The server returned 401. Syncing waits for a new session instead of retrying. */
  needsAuth: boolean;
}

export interface SyncEngineOptions {
  store: IOfflineStore;
  api: SyncApi;
  network: Pick<NetworkMonitor, 'getStatus' | 'subscribe'>;
  /** Called on a 401. AuthContext refreshes the session, then calls syncNow(). */
  onUnauthorized?: () => void;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

type FailureKind = 'retry' | 'unauthorized' | 'closed' | 'rejected';

/** How the engine reacts to a failed Phase 1 request. */
export function classifyFailure(err: unknown): FailureKind {
  const status = httpStatus(err);
  if (status === undefined) return 'retry'; // network failure or timeout: no HTTP response at all
  if (status === 401) return 'unauthorized';
  if (status === 429 || status >= 500) return 'retry';
  if (status === 403 || status === 404 || status === 409) return 'closed'; // submitted, expired, or not this student's
  return 'rejected'; // e.g. 400: the server will never accept this answer as it stands
}

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } } | undefined)?.response?.status;
}

function errorMessage(err: unknown): string {
  const message = (err as { response?: { data?: { message?: unknown } } } | undefined)?.response?.data?.message;
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : String(err);
}

const initialStatus = (attemptId: string | null): SyncStatus => ({
  attemptId,
  answers: {},
  submit: 'idle',
  syncing: false,
  attemptClosed: false,
  needsAuth: false,
});

/**
 * Background sync for one attempt at a time. Pushes pending answers to the
 * Phase 1 Answer API one request at a time (so they can't arrive out of order),
 * then sends a queued submission once nothing is left to push.
 */
export class SyncEngine {
  private status = initialStatus(null);
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private running: Promise<void> | null = null;
  private rerun = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: SyncEngineOptions) {
    options.network.subscribe((network) => {
      if (network !== 'online') return;
      this.failures = 0; // back online: retry now rather than waiting out the backoff
      void this.syncNow();
    });
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Shows a just-saved answer as pending straight away, then syncs it. */
  answerSaved(attemptId: string, questionId: string): Promise<void> {
    const done = this.syncNow(attemptId);
    this.setAnswer({ attemptId, questionId }, 'pending');
    return done;
  }

  /**
   * Pushes pending answers, then a queued submission, for `attemptId` (default:
   * the current attempt). Resolves when this round is over; never rejects.
   */
  syncNow(attemptId = this.status.attemptId): Promise<void> {
    if (!attemptId) return Promise.resolve();
    if (attemptId !== this.status.attemptId) {
      this.stop();
      this.update(initialStatus(attemptId));
    }
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.loop().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Stops syncing, e.g. on logout. Pending answers and submit intents stay stored. */
  stop(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.failures = 0;
    this.update(initialStatus(null));
  }

  private async loop(): Promise<void> {
    do {
      this.rerun = false;
      const attemptId = this.status.attemptId;
      if (!attemptId) return;
      try {
        await this.syncOnce(attemptId);
      } catch {
        this.scheduleRetry(); // local storage failed; try again later
      }
    } while (this.rerun);
  }

  private async syncOnce(attemptId: string): Promise<void> {
    const { store, network } = this.options;
    clearTimeout(this.retryTimer);

    const pending = await store.getPendingAnswers(attemptId);
    const intent = await store.getSubmitIntent(attemptId);
    if (attemptId !== this.status.attemptId) return; // stopped or switched attempts meanwhile
    this.update({
      answers: { ...this.status.answers, ...Object.fromEntries(pending.map((answer) => [answer.questionId, 'pending'])) },
      submit: intent ? 'pending' : this.status.submit,
    });
    if (network.getStatus() === 'offline') return; // the network monitor calls syncNow() on reconnect

    this.update({ syncing: true, needsAuth: false });
    try {
      for (const answer of pending) {
        if (attemptId !== this.status.attemptId || !(await this.push(answer))) return;
      }
      // Submit only once every answer has been pushed, or the submission would lock them out.
      if (intent && !this.rerun && !(await this.submit(attemptId))) return;
      this.failures = 0;
    } finally {
      this.update({ syncing: false });
    }
  }

  /** Sends one answer. Returns false when this round has to stop (retry later, or no session). */
  private async push(answer: LocalAnswer): Promise<boolean> {
    const { store, api } = this.options;
    if (this.status.attemptClosed) {
      await this.markFailed(answer, 'This attempt is no longer accepting answers');
      return true;
    }

    try {
      await api.saveAnswer(answer.attemptId, answer.questionId, answer.payload);
    } catch (err) {
      const kind = classifyFailure(err);
      if (kind === 'retry') return this.scheduleRetry();
      if (kind === 'unauthorized') return this.waitForAuth();
      if (kind === 'closed') this.update({ attemptClosed: true });
      await this.markFailed(answer, errorMessage(err));
      return true;
    }

    const synced = await store.markSynced(answer.attemptId, answer.questionId, answer.revision);
    if (!synced) this.rerun = true; // edited while the request was in flight: send the newer version
    this.setAnswer(answer, synced ? 'synced' : 'pending');
    return true;
  }

  /** Sends the queued submission. Returns false when this round has to stop. */
  private async submit(attemptId: string): Promise<boolean> {
    const { store, api } = this.options;
    try {
      await api.submitAttempt(attemptId);
    } catch (err) {
      const kind = classifyFailure(err);
      if (kind === 'retry') return this.scheduleRetry();
      if (kind === 'unauthorized') return this.waitForAuth();
      // 409 means it's already submitted (by an earlier request, or automatically
      // on expiry), which is the outcome we wanted. Anything else won't change on retry.
      if (httpStatus(err) !== 409) {
        await store.clearSubmitIntent(attemptId);
        this.update({ submit: 'failed' });
        return true;
      }
    }
    await store.clearSubmitIntent(attemptId);
    this.update({ submit: 'submitted', attemptClosed: true });
    return true;
  }

  private async markFailed(answer: LocalAnswer, error: string): Promise<void> {
    const failed = await this.options.store.markFailed(answer.attemptId, answer.questionId, answer.revision, error);
    if (!failed) this.rerun = true; // a newer edit exists; it gets its own try
    this.setAnswer(answer, failed ? 'failed' : 'pending');
  }

  /** Backs off exponentially: 1s, 2s, 4s... up to 30s by default. */
  private scheduleRetry(): false {
    const { retryBaseMs = 1_000, retryMaxMs = 30_000 } = this.options;
    const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** this.failures);
    this.failures += 1;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.syncNow(), delay);
    return false;
  }

  /** No automatic retry on a 401: the next save, reconnect or syncNow() call tries again. */
  private waitForAuth(): false {
    this.update({ needsAuth: true });
    this.options.onUnauthorized?.();
    return false;
  }

  private setAnswer(answer: Pick<LocalAnswer, 'attemptId' | 'questionId'>, status: AnswerSyncStatus): void {
    if (answer.attemptId !== this.status.attemptId) return;
    this.update({ answers: { ...this.status.answers, [answer.questionId]: status } });
  }

  private update(change: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...change };
    for (const listener of this.listeners) listener(this.status);
  }
}
