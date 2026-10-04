/**
 * Owner: Person B
 * Local UI types for the Exam-taking screen.
 * Note: Domain models and enums (Question, QuestionType, QuestionState, Attempt)
 * are imported directly from @secure-exam/types to avoid duplication.
 */
import { QuestionState } from '@secure-exam/types';

export interface AnswerDraft {
  selectedOptionIds: string[];
  textResponse: string;
}

export interface PaletteItem {
  index: number;
  questionId: string;
  state: QuestionState;
  isCurrent: boolean;
}

export interface PaletteSummary {
  total: number;
  answered: number;
  visited: number;
  notVisited: number;
  markedReview: number;
  answeredAndMarkedReview: number;
}

export type PaletteFilter = 'ALL' | 'ANSWERED' | 'UNANSWERED' | 'REVIEW';

export interface ExamNavigationState {
  canGoPrevious: boolean;
  canGoNext: boolean;
  isLastQuestion: boolean;
}
