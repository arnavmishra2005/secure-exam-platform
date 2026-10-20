/**
 * Owner: Person B
 * NavigationControls: Actions bar for navigating questions, marking for review,
 * clearing responses, saving answers, and triggering submission.
 */
import React from 'react';

interface NavigationControlsProps {
  canGoPrevious: boolean;
  canGoNext: boolean;
  isLastQuestion: boolean;
  isMarkedForReview: boolean;
  hasResponse: boolean;
  isSaving?: boolean;
  onPrevious: () => void;
  onSaveAndNext: () => void;
  onMarkForReviewAndNext: () => void;
  onClearResponse: () => void;
  onSubmitClick?: () => void;
  disabled?: boolean;
}

export const NavigationControls: React.FC<NavigationControlsProps> = ({
  canGoPrevious,
  canGoNext,
  isLastQuestion,
  isMarkedForReview,
  hasResponse,
  isSaving = false,
  onPrevious,
  onSaveAndNext,
  onMarkForReviewAndNext,
  onClearResponse,
  disabled = false,
}) => {
  return (
    <div className="bg-paper-raised border border-hairline rounded p-4 mt-6 flex flex-wrap items-center justify-between gap-3 shadow-none">
      {/* Left controls: Previous & Clear */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canGoPrevious || disabled}
          className="px-4 py-2 text-xs font-semibold rounded border border-hairline bg-white text-ink hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          &larr; Previous
        </button>

        <button
          type="button"
          onClick={onClearResponse}
          disabled={!hasResponse || disabled}
          className="px-3.5 py-2 text-xs font-medium rounded border border-hairline/80 text-ash-muted hover:text-brick hover:border-brick/40 hover:bg-brick-light/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Clear Response
        </button>
      </div>

      {/* Center/Right controls: Mark for Review, Save & Next, and Submit */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onMarkForReviewAndNext}
          disabled={disabled || isSaving}
          className={`px-4 py-2 text-xs font-semibold rounded border transition-colors ${
            isMarkedForReview
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100'
              : 'border-indigo-600/40 text-indigo-700 bg-white hover:bg-indigo-50'
          }`}
        >
          {isMarkedForReview ? 'Unmark Review' : 'Mark for Review & Next'}
        </button>

        <button
          type="button"
          onClick={onSaveAndNext}
          disabled={disabled || isSaving}
          className="px-5 py-2 text-xs font-semibold rounded bg-verdigris hover:bg-verdigris-dark text-white transition-colors flex items-center gap-1.5 shadow-xs"
        >
          {isSaving ? (
            <span>Saving...</span>
          ) : isLastQuestion ? (
            <span>Save & Finish Section</span>
          ) : (
            <span>Save & Next &rarr;</span>
          )}
        </button>
      </div>
    </div>
  );
};
