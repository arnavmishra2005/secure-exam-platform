/**
 * Owner: Person B
 * Seam Hook: Thin wrapper connecting Person B's UI actions to Person C's persistence layer.
 *
 * CRITICAL RULE:
 * This hook NEVER touches IndexedDB directly and NEVER calls the backend answer API directly.
 * It calls Person C's `IOfflineStore` (obtained via `getOfflineStore()`).
 */
import { useCallback, useState } from 'react';
import { useExamStore } from '../store/examStore';
import { getOfflineStore, SaveAnswerInput } from '../persistence';

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

        const input: SaveAnswerInput = {
          selectedOptionIds: draft.selectedOptionIds,
          textResponse: draft.textResponse,
          markedForReview: isMarked,
        };

        const offlineStore = getOfflineStore();
        await offlineStore.saveAnswer(attemptId, questionId, input);

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
        const input: SaveAnswerInput = {
          clearResponse: true,
          markedForReview: isMarked,
        };

        const offlineStore = getOfflineStore();
        await offlineStore.saveAnswer(attemptId, questionId, input);

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
        const newMarked = !updatedState.markedForReview[questionId];

        const input: SaveAnswerInput = {
          selectedOptionIds: draft.selectedOptionIds,
          textResponse: draft.textResponse,
          markedForReview: newMarked,
        };

        const offlineStore = getOfflineStore();
        await offlineStore.saveAnswer(attemptId, questionId, input);

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
   * Hydrate all saved answers from offline storage into local exam store
   */
  const restoreAnswersFromStore = useCallback(async () => {
    if (!attemptId) return;
    try {
      const offlineStore = getOfflineStore();
      const all = await offlineStore.getAllAnswers(attemptId);
      useExamStore.getState().loadSavedAnswers(all);
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
