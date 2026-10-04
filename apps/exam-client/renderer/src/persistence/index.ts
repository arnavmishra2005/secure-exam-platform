/**
 * Owner: Person C
 * Factory point to get the offline store.
 * Person B calls this to access the storage interface.
 * When Person C implements indexedDbStore, it swaps in here.
 */
import { IOfflineStore, SaveAnswerInput, StoredAnswer } from './offlineStore.interface';
import { QuestionState } from '@secure-exam/types';

class LocalStorageOfflineStore implements IOfflineStore {
  private getStorageKey(attemptId: string): string {
    return `secure_exam_answers_${attemptId}`;
  }

  private readAll(attemptId: string): Record<string, StoredAnswer> {
    try {
      const raw = localStorage.getItem(this.getStorageKey(attemptId));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private writeAll(attemptId: string, data: Record<string, StoredAnswer>): void {
    try {
      localStorage.setItem(this.getStorageKey(attemptId), JSON.stringify(data));
    } catch (e) {
      console.error('Failed to write to localStorage offline store', e);
    }
  }

  async saveAnswer(attemptId: string, questionId: string, input: SaveAnswerInput): Promise<StoredAnswer> {
    const all = this.readAll(attemptId);
    const existing = all[questionId];

    let state = input.state;
    if (!state) {
      const hasOptions = input.selectedOptionIds && input.selectedOptionIds.length > 0;
      const hasText = input.textResponse && input.textResponse.trim().length > 0;
      const hasContent = hasOptions || hasText;

      if (input.clearResponse) {
        state = QuestionState.VISITED;
      } else if (input.markedForReview && hasContent) {
        state = QuestionState.ANSWERED_AND_MARKED_REVIEW;
      } else if (input.markedForReview) {
        state = QuestionState.MARKED_REVIEW;
      } else if (hasContent) {
        state = QuestionState.ANSWERED;
      } else {
        state = QuestionState.VISITED;
      }
    }

    const stored: StoredAnswer = {
      attemptId,
      questionId,
      selectedOptionIds: input.clearResponse ? null : (input.selectedOptionIds ?? existing?.selectedOptionIds ?? null),
      textResponse: input.clearResponse ? null : (input.textResponse ?? existing?.textResponse ?? null),
      state,
      answeredAt: input.clearResponse ? null : new Date().toISOString(),
      synced: false,
    };

    all[questionId] = stored;
    this.writeAll(attemptId, all);
    return stored;
  }

  async getAnswer(attemptId: string, questionId: string): Promise<StoredAnswer | null> {
    const all = this.readAll(attemptId);
    return all[questionId] || null;
  }

  async getAllAnswers(attemptId: string): Promise<Record<string, StoredAnswer>> {
    return this.readAll(attemptId);
  }

  async getPendingAnswers(attemptId: string): Promise<StoredAnswer[]> {
    const all = this.readAll(attemptId);
    return Object.values(all).filter((a) => !a.synced);
  }

  async markSynced(attemptId: string, questionId: string): Promise<void> {
    const all = this.readAll(attemptId);
    if (all[questionId]) {
      all[questionId].synced = true;
      this.writeAll(attemptId, all);
    }
  }
}

let storeInstance: IOfflineStore | null = null;

export function getOfflineStore(): IOfflineStore {
  if (!storeInstance) {
    storeInstance = new LocalStorageOfflineStore();
  }
  return storeInstance;
}

export * from './offlineStore.interface';
