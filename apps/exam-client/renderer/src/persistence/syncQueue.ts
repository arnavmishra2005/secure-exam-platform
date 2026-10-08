import type { SaveAnswerPayload } from '@secure-exam/api-client';
import type { LocalAnswer } from './offlineStore.interface';

// The pending-answer queue rules. Every IOfflineStore implementation applies
// these, so IndexedDB (and later SQLite) behave the same way.

/**
 * Folds a new edit into the queued payload, using the same rules as the Phase 1
 * Answer API (AnswerService.applyAnswerUpdate): omitted fields keep their value,
 * and clearResponse wipes the content but keeps the review flag. A single PUT
 * then applies every queued edit.
 */
export function mergePayload(queued: SaveAnswerPayload | undefined, update: SaveAnswerPayload): SaveAnswerPayload {
  const markedForReview = update.markedForReview ?? queued?.markedForReview;

  if (update.clearResponse) {
    return markedForReview === undefined ? { clearResponse: true } : { clearResponse: true, markedForReview };
  }

  const merged: SaveAnswerPayload = { ...queued };
  if (update.selectedOptionIds !== undefined) {
    merged.selectedOptionIds = update.selectedOptionIds;
    delete merged.clearResponse;
  }
  if (update.textResponse !== undefined) {
    merged.textResponse = update.textResponse;
    delete merged.clearResponse;
  }
  if (markedForReview !== undefined) merged.markedForReview = markedForReview;
  return merged;
}

/** The answer after a local edit: payload merged, next revision, back in the queue. */
export function applyEdit(
  existing: LocalAnswer | undefined,
  attemptId: string,
  questionId: string,
  update: SaveAnswerPayload,
): LocalAnswer {
  return {
    attemptId,
    questionId,
    payload: mergePayload(existing?.payload, update),
    revision: (existing?.revision ?? 0) + 1,
    status: 'pending',
    updatedAt: Date.now(),
  };
}

/** The answer once the server accepted `revision`, or null if it was edited since. */
export function applySynced(existing: LocalAnswer | undefined, revision: number): LocalAnswer | null {
  if (!existing || existing.revision !== revision) return null;
  return { ...existing, status: 'synced', error: undefined };
}

/** The answer once the server refused `revision`, or null if it was edited since. */
export function applyFailed(existing: LocalAnswer | undefined, revision: number, error: string): LocalAnswer | null {
  if (!existing || existing.revision !== revision) return null;
  return { ...existing, status: 'failed', error };
}

/** Answers waiting to sync, oldest edit first. */
export function pendingInOrder(answers: LocalAnswer[]): LocalAnswer[] {
  return answers.filter((answer) => answer.status === 'pending').sort((a, b) => a.updatedAt - b.updatedAt);
}
