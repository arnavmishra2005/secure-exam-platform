import { QuestionState } from '@secure-exam/types';

export interface StoredAnswer {
  id?: string;
  attemptId: string;
  questionId: string;
  selectedOptionIds: string[] | null;
  textResponse: string | null;
  state: QuestionState;
  answeredAt: string | null;
  synced: boolean;
}

export interface SaveAnswerInput {
  selectedOptionIds?: string[];
  textResponse?: string;
  markedForReview?: boolean;
  clearResponse?: boolean;
  state?: QuestionState;
}

/**
 * Owner: Person C
 * The storage interface all UI code codes against.
 * Now: IndexedDB (browser)
 * Phase 4: SQLite (Electron main process)
 */
export interface IOfflineStore {
  saveAnswer(attemptId: string, questionId: string, input: SaveAnswerInput): Promise<StoredAnswer>;
  getAnswer(attemptId: string, questionId: string): Promise<StoredAnswer | null>;
  getAllAnswers(attemptId: string): Promise<Record<string, StoredAnswer>>;
  getPendingAnswers(attemptId: string): Promise<StoredAnswer[]>;
  markSynced(attemptId: string, questionId: string): Promise<void>;
}
