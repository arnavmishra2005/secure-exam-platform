/**
 * Owner: Person B
 * Seam Hook: Thin wrapper connecting Person B's UI actions to Person C's persistence layer.
 *
 * CRITICAL RULE:
 * This hook NEVER touches IndexedDB directly and NEVER calls the backend answer API directly.
 * It calls Person C's `saveAnswer()`, which stores the answer on this device and syncs it
 * in the background.
 */
import { useCallback, useState } from 'react';
import { QuestionState } from '@secure-exam/types';
import { listAnswers, type SaveAnswerPayload } from '@secure-exam/api-client';
import { useExamStore } from '../store/examStore';
import { getOfflineStore, saveAnswer as persistAnswer } from '../persistence';
import { isFixtureAttempt } from '../contexts/AttemptContext';

function persist(attemptId: string, questionId: string, update: SaveAnswerPayload): Promise<void> {
  // The demo attempt doesn't exist on the server: keep its answers on this device only.
  if (isFixtureAttempt(attemptId)) return getOfflineStore().saveAnswer(attemptId, questionId, update);
  return persistAnswer(attemptId, questionId, update);
}

export function useAnswer(attemptId: string) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  /**
   * Save current answer draft to offline storage and mark as answered in UI
   */
  const saveAnswer = useCallback(
    async (questionId: string, options: { advance?: boolean } = {}) => {
      if (!attemptId || !questionId) return;

      setIsSaving(true);
      try {
        const state = useExamStore.getState();
        const draft = state.answers[questionId] || { selectedOptionIds: [], textResponse: '' };
        const isMarked = !!state.markedForReview[questionId];

        await persist(attemptId, questionId, {
          selectedOptionIds: draft.selectedOptionIds,
          textResponse: draft.textResponse,
          markedForReview: isMarked,
        });

        // Update local UI state
        state.markAsSaved(questionId);
        setLastSavedAt(new Date());

        if (options.advance) {
          state.goToNext();
        }
      } catch (err) {
        console.error('Failed to save answer through offlineStore', err);
      } finally {
        setIsSaving(false);
      }
    },
    [attemptId],
  );

  /**
   * Clear current response in UI and persist cleared state
   */
  const clearAnswer = useCallback(
    async (questionId: string) => {
      if (!attemptId || !questionId) return;

      setIsSaving(true);
      try {
        const state = useExamStore.getState();
        const isMarked = !!state.markedForReview[questionId];

        await persist(attemptId, questionId, {
          clearResponse: true,
          markedForReview: isMarked,
        });

        state.clearCurrentAnswer(questionId);
        setLastSavedAt(new Date());
      } catch (err) {
        console.error('Failed to clear answer', err);
      } finally {
        setIsSaving(false);
      }
    },
    [attemptId],
  );

  /**
   * Mark / Unmark current question for review and persist
   */
  const toggleReview = useCallback(
    async (questionId: string, options: { advance?: boolean } = {}) => {
      if (!attemptId || !questionId) return;

      setIsSaving(true);
      try {
        const state = useExamStore.getState();
        // Toggle in local store first to get new state
        state.toggleMarkForReview(questionId);

        const updatedState = useExamStore.getState();
        const draft = updatedState.answers[questionId] || { selectedOptionIds: [], textResponse: '' };
        const newMarked = !!updatedState.markedForReview[questionId];

        await persist(attemptId, questionId, {
          selectedOptionIds: draft.selectedOptionIds,
          textResponse: draft.textResponse,
          markedForReview: newMarked,
        });

        setLastSavedAt(new Date());

        if (options.advance) {
          updatedState.goToNext();
        }
      } catch (err) {
        console.error('Failed to toggle review', err);
      } finally {
        setIsSaving(false);
      }
    },
    [attemptId],
  );

  /**
   * Hydrate saved answers into local exam store: the server's copy first (covers
   * resuming in another tab or browser), then this device's, which always wins
   * because it may hold edits the server hasn't received yet.
   */
  const restoreAnswersFromStore = useCallback(async () => {
    if (!attemptId) return;
    try {
      const [serverAnswers, all] = await Promise.all([
        isFixtureAttempt(attemptId)
          ? []
          : listAnswers(attemptId).catch((err) => {
              console.warn('Could not load saved answers from the server; using this device only', err);
              return [];
            }),
        getOfflineStore().getAllAnswers(attemptId),
      ]);
      const mapped: Record<
        string,
        {
          selectedOptionIds: string[] | null;
          textResponse: string | null;
          state: QuestionState;
        }
      > = {};

      for (const answer of serverAnswers) {
        mapped[answer.questionId] = {
          selectedOptionIds: answer.selectedOptionIds,
          textResponse: answer.textResponse,
          state: answer.state,
        };
      }

      for (const item of all) {
        // `payload` holds every local edit merged together, so it is the answer's current content.
        const { payload } = item;
        const selectedOptionIds = payload.clearResponse ? null : payload.selectedOptionIds ?? null;
        const textResponse = payload.clearResponse ? null : payload.textResponse ?? null;
        const hasAns =
          Boolean(selectedOptionIds && selectedOptionIds.length > 0) ||
          Boolean(textResponse && textResponse.trim().length > 0);
        let qState = QuestionState.VISITED;
        if (payload.markedForReview && hasAns) {
          qState = QuestionState.ANSWERED_AND_MARKED_REVIEW;
        } else if (payload.markedForReview) {
          qState = QuestionState.MARKED_REVIEW;
        } else if (hasAns) {
          qState = QuestionState.ANSWERED;
        }

        mapped[item.questionId] = {
          selectedOptionIds,
          textResponse,
          state: qState,
        };
      }

      useExamStore.getState().loadSavedAnswers(mapped);
    } catch (err) {
      console.error('Failed to restore answers from offline store', err);
    }
  }, [attemptId]);

  return {
    saveAnswer,
    clearAnswer,
    toggleReview,
    restoreAnswersFromStore,
    isSaving,
    lastSavedAt,
  };
}
