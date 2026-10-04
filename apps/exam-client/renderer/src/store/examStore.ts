/**
 * Owner: Person B
 * Zustand store for local exam navigation and in-memory question interaction.
 * Kept strictly decoupled from the persistence/sync layer (Person C).
 */
import { create } from 'zustand';
import { QuestionState } from '@secure-exam/types';
import { AnswerDraft, PaletteSummary } from '../types/ui.types';

interface ExamState {
  // Navigation
  currentIndex: number;
  questionIds: string[];

  // Answer drafts & states keyed by questionId
  answers: Record<string, AnswerDraft>;
  questionStates: Record<string, QuestionState>;
  markedForReview: Record<string, boolean>;

  // Actions
  initExam: (questionIds: string[]) => void;
  loadSavedAnswers: (saved: Record<string, { selectedOptionIds: string[] | null; textResponse: string | null; state: QuestionState }>) => void;
  setCurrentIndex: (index: number) => void;
  goToNext: () => void;
  goToPrevious: () => void;

  // Interacting with the current question
  selectOption: (questionId: string, optionId: string, isMulti: boolean) => void;
  setTextResponse: (questionId: string, text: string) => void;
  clearCurrentAnswer: (questionId: string) => void;
  toggleMarkForReview: (questionId: string) => void;
  markAsSaved: (questionId: string) => void;

  // Selectors
  getSummary: () => PaletteSummary;
}

export const useExamStore = create<ExamState>((set, get) => ({
  currentIndex: 0,
  questionIds: [],
  answers: {},
  questionStates: {},
  markedForReview: {},

  initExam: (questionIds: string[]) => {
    const states: Record<string, QuestionState> = {};
    const answers: Record<string, AnswerDraft> = {};
    const reviews: Record<string, boolean> = {};

    questionIds.forEach((id, idx) => {
      // First question starts as VISITED, others as NOT_VISITED
      states[id] = idx === 0 ? QuestionState.VISITED : QuestionState.NOT_VISITED;
      answers[id] = { selectedOptionIds: [], textResponse: '' };
      reviews[id] = false;
    });

    set({
      questionIds,
      currentIndex: 0,
      questionStates: states,
      answers,
      markedForReview: reviews,
    });
  },

  loadSavedAnswers: (saved) => {
    set((state) => {
      const nextStates = { ...state.questionStates };
      const nextAnswers = { ...state.answers };
      const nextReviews = { ...state.markedForReview };

      Object.entries(saved).forEach(([qId, item]) => {
        if (item.selectedOptionIds || item.textResponse) {
          nextAnswers[qId] = {
            selectedOptionIds: item.selectedOptionIds || [],
            textResponse: item.textResponse || '',
          };
        }
        if (item.state) {
          nextStates[qId] = item.state;
          if (
            item.state === QuestionState.MARKED_REVIEW ||
            item.state === QuestionState.ANSWERED_AND_MARKED_REVIEW
          ) {
            nextReviews[qId] = true;
          }
        }
      });

      return {
        questionStates: nextStates,
        answers: nextAnswers,
        markedForReview: nextReviews,
      };
    });
  },

  setCurrentIndex: (index: number) => {
    const { questionIds, currentIndex, questionStates, answers, markedForReview } = get();
    if (index < 0 || index >= questionIds.length) return;

    const currentQId = questionIds[currentIndex];
    const targetQId = questionIds[index];

    const nextStates = { ...questionStates };

    // Update previous question state if it was unvisited/visited without answers
    if (currentQId && nextStates[currentQId] === QuestionState.NOT_VISITED) {
      nextStates[currentQId] = QuestionState.VISITED;
    }

    // Target question becomes at least VISITED if it was NOT_VISITED
    if (targetQId && nextStates[targetQId] === QuestionState.NOT_VISITED) {
      nextStates[targetQId] = QuestionState.VISITED;
    }

    set({
      currentIndex: index,
      questionStates: nextStates,
    });
  },

  goToNext: () => {
    const { currentIndex, questionIds, setCurrentIndex } = get();
    if (currentIndex < questionIds.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  },

  goToPrevious: () => {
    const { currentIndex, setCurrentIndex } = get();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  },

  selectOption: (questionId: string, optionId: string, isMulti: boolean) => {
    set((state) => {
      const currentDraft = state.answers[questionId] || { selectedOptionIds: [], textResponse: '' };
      let newSelected: string[];

      if (isMulti) {
        if (currentDraft.selectedOptionIds.includes(optionId)) {
          newSelected = currentDraft.selectedOptionIds.filter((id) => id !== optionId);
        } else {
          newSelected = [...currentDraft.selectedOptionIds, optionId];
        }
      } else {
        // Single choice toggle / select
        newSelected = [optionId];
      }

      return {
        answers: {
          ...state.answers,
          [questionId]: {
            ...currentDraft,
            selectedOptionIds: newSelected,
          },
        },
      };
    });
  },

  setTextResponse: (questionId: string, text: string) => {
    set((state) => {
      const currentDraft = state.answers[questionId] || { selectedOptionIds: [], textResponse: '' };
      return {
        answers: {
          ...state.answers,
          [questionId]: {
            ...currentDraft,
            textResponse: text,
          },
        },
      };
    });
  },

  clearCurrentAnswer: (questionId: string) => {
    set((state) => {
      const isMarked = state.markedForReview[questionId];
      return {
        answers: {
          ...state.answers,
          [questionId]: { selectedOptionIds: [], textResponse: '' },
        },
        questionStates: {
          ...state.questionStates,
          [questionId]: isMarked ? QuestionState.MARKED_REVIEW : QuestionState.VISITED,
        },
      };
    });
  },

  toggleMarkForReview: (questionId: string) => {
    set((state) => {
      const currentlyMarked = !!state.markedForReview[questionId];
      const nextMarked = !currentlyMarked;

      const draft = state.answers[questionId];
      const hasContent = (draft?.selectedOptionIds && draft.selectedOptionIds.length > 0) ||
                         (draft?.textResponse && draft.textResponse.trim().length > 0);

      let nextState: QuestionState;
      if (nextMarked) {
        nextState = hasContent
          ? QuestionState.ANSWERED_AND_MARKED_REVIEW
          : QuestionState.MARKED_REVIEW;
      } else {
        nextState = hasContent
          ? QuestionState.ANSWERED
          : QuestionState.VISITED;
      }

      return {
        markedForReview: {
          ...state.markedForReview,
          [questionId]: nextMarked,
        },
        questionStates: {
          ...state.questionStates,
          [questionId]: nextState,
        },
      };
    });
  },

  markAsSaved: (questionId: string) => {
    set((state) => {
      const isMarked = !!state.markedForReview[questionId];
      const draft = state.answers[questionId];
      const hasContent = (draft?.selectedOptionIds && draft.selectedOptionIds.length > 0) ||
                         (draft?.textResponse && draft.textResponse.trim().length > 0);

      let nextState: QuestionState;
      if (isMarked && hasContent) {
        nextState = QuestionState.ANSWERED_AND_MARKED_REVIEW;
      } else if (isMarked) {
        nextState = QuestionState.MARKED_REVIEW;
      } else if (hasContent) {
        nextState = QuestionState.ANSWERED;
      } else {
        nextState = QuestionState.VISITED;
      }

      return {
        questionStates: {
          ...state.questionStates,
          [questionId]: nextState,
        },
      };
    });
  },

  getSummary: (): PaletteSummary => {
    const { questionIds, questionStates } = get();
    let answered = 0;
    let visited = 0;
    let notVisited = 0;
    let markedReview = 0;
    let answeredAndMarkedReview = 0;

    questionIds.forEach((id) => {
      const st = questionStates[id] || QuestionState.NOT_VISITED;
      switch (st) {
        case QuestionState.ANSWERED:
          answered++;
          break;
        case QuestionState.VISITED:
          visited++;
          break;
        case QuestionState.MARKED_REVIEW:
          markedReview++;
          break;
        case QuestionState.ANSWERED_AND_MARKED_REVIEW:
          answeredAndMarkedReview++;
          break;
        case QuestionState.NOT_VISITED:
        default:
          notVisited++;
          break;
      }
    });

    return {
      total: questionIds.length,
      answered,
      visited,
      notVisited,
      markedReview,
      answeredAndMarkedReview,
    };
  },
}));
