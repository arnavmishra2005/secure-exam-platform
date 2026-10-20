import type { SaveAnswerPayload } from '@secure-exam/api-client';

/**
 * `pending`: saved on this device, not yet confirmed by the server (the plan's
 * "Saved locally" / "Pending"). `failed`: the server refused it; it is kept but
 * not retried unless the student edits it again.
 */
export type AnswerSyncStatus = 'pending' | 'synced' | 'failed';

/**
 * One question's answer as stored on this device.
 *
 * Adapted from the plan's sketch, which stored Phase 1's `Answer`. That type is
 * the server's response (server id, derived state, timestamps), which an answer
 * that hasn't synced yet doesn't have. So we keep the Phase 1 Answer API request
 * body, plus a local revision so a sync can't mark a newer edit as synced.
 */
export interface LocalAnswer {
  attemptId: string;
  questionId: string;
  /** Every edit not yet confirmed by the server, merged into one PUT body. */
  payload: SaveAnswerPayload;
  /** Goes up by one on every local save. */
  revision: number;
  status: AnswerSyncStatus;
  /** The server's reason, when `status` is `failed`. */
  error?: string;
  /** Client time of the last local save (ms since epoch). */
  updatedAt: number;
}

/** A submission the student asked for that hasn't reached the server yet. */
export interface SubmitIntent {
  attemptId: string;
  requestedAt: number;
}

/**
 * Person B (coding questions): the student's latest code for one question,
 * kept on the device so a reload or crash never loses it. The last saved
 * draft is what gets graded if the student never presses Submit.
 */
export interface CodeDraft {
  attemptId: string;
  questionId: string;
  /** Key of the API's language registry, e.g. 'python'. */
  language: string;
  code: string;
  /** Client time of the last save (ms since epoch). */
  updatedAt: number;
}

/**
 * Person C (desktop security): a client event (focus lost, display changed,
 * blocked shortcut, ...) waiting to be sent to the server.
 */
export interface QueuedEvent {
  /** Client-generated id; the server de-duplicates on it. */
  id: string;
  attemptId: string;
  /** A SecurityEventType from @secure-exam/types. */
  type: string;
  /** Client time the event happened (ms since epoch). Informational only. */
  occurredAt: number;
  metadata: Record<string, unknown>;
}

/**
 * IOfflineStore v2 (Day 1 contract): one local store, three concerns.
 * UI code never calls IndexedDB (or, later, SQLite) directly.
 *  - answers + submit intent (Phase 2/3, unchanged)
 *  - code drafts (Person B)
 *  - queued client events (Person C)
 */
export interface IOfflineStore extends IAnswerStore, ICodeDraftStore, IEventQueueStore {}

export interface ICodeDraftStore {
  saveCodeDraft(draft: Omit<CodeDraft, 'updatedAt'>): Promise<void>;
  getCodeDraft(attemptId: string, questionId: string): Promise<CodeDraft | null>;
  getAllCodeDrafts(attemptId: string): Promise<CodeDraft[]>;
}

export interface IEventQueueStore {
  /** Appends an event; the id is generated here. */
  queueEvent(event: Omit<QueuedEvent, 'id'>): Promise<QueuedEvent>;
  /** Oldest first. */
  getQueuedEvents(attemptId: string, limit?: number): Promise<QueuedEvent[]>;
  /** Called once the server has acknowledged these events. */
  removeEvents(ids: string[]): Promise<void>;
}

/**
 * Answers and the submit intent. IndexedDB implements it now; Phase 4 can swap
 * in SQLite via getOfflineStore() in index.ts.
 */
export interface IAnswerStore {
  /** Saves an edit locally and queues it for sync. Fields mean what they mean in the Phase 1 Answer API. */
  saveAnswer(attemptId: string, questionId: string, update: SaveAnswerPayload): Promise<void>;
  getAnswer(attemptId: string, questionId: string): Promise<LocalAnswer | null>;
  /** Every answer stored for the attempt, whatever its status; restores the exam screen after a reload. */
  getAllAnswers(attemptId: string): Promise<LocalAnswer[]>;
  /** Answers still waiting to sync, oldest edit first. */
  getPendingAnswers(attemptId: string): Promise<LocalAnswer[]>;
  /**
   * Records that the server accepted `revision`. Returns false, leaving the answer
   * pending, if it was edited again meanwhile. (The plan's `markSynced(answerId)`
   * can't work: an answer has no server id until it has synced.)
   */
  markSynced(attemptId: string, questionId: string, revision: number): Promise<boolean>;
  /** Records that the server refused `revision`. Returns false if a newer edit exists. */
  markFailed(attemptId: string, questionId: string, revision: number, error: string): Promise<boolean>;
  saveSubmitIntent(attemptId: string): Promise<void>;
  getSubmitIntent(attemptId: string): Promise<SubmitIntent | null>;
  clearSubmitIntent(attemptId: string): Promise<void>;
}
