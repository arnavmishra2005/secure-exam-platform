/**
 * Owner: Person B
 * SubmitConfirmationModal: Displays final question counts and requests confirmation before submitting.
 */
import React from 'react';
import { PaletteSummary } from '../../types/ui.types';

interface SubmitConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  summary: PaletteSummary;
  isSubmitting?: boolean;
  /** Person C's queued submission: requested, waiting for the connection to return. */
  isSubmitPending?: boolean;
  error?: string | null;
}

export const SubmitConfirmationModal: React.FC<SubmitConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  summary,
  isSubmitting = false,
  isSubmitPending = false,
  error = null,
}) => {
  if (!isOpen) return null;

  const isBusy = isSubmitting || isSubmitPending;

  const totalAnswered = summary.answered + summary.answeredAndMarkedReview;
  const totalUnanswered = summary.total - totalAnswered;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-xs p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-paper-raised border border-hairline rounded max-w-md w-full p-6 shadow-xl relative animate-scale-up">
        {/* Header */}
        <div className="pb-3 border-b border-hairline flex items-center justify-between">
          <h2 id="modal-title" className="font-serif font-bold text-xl text-ink">
            Submit Examination
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="text-ash-muted hover:text-ink text-sm p-1 rounded transition-colors"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {isSubmitPending && (
          <div className="my-4 p-3.5 rounded bg-gold-light/40 border border-gold/40 text-xs leading-relaxed" role="status">
            <p className="font-semibold text-ink">Submission pending: reconnect to finish</p>
            <p className="text-ash mt-0.5">
              Your answers and submission are saved on this device. They will be sent automatically when the
              connection returns. Do not close this window.
            </p>
          </div>
        )}

        {error && (
          <div className="my-4 p-3.5 rounded bg-brick-light/40 border border-brick/40 text-brick text-xs" role="alert">
            {error}
          </div>
        )}

        {/* Warning banner if unanswered questions remain */}
        {totalUnanswered > 0 && (
          <div className="my-4 p-3.5 rounded bg-gold-light/40 border border-gold/40 text-gold text-xs leading-relaxed flex items-start gap-2.5">
            <span className="font-bold text-base leading-none">⚠️</span>
            <div>
              <p className="font-semibold text-ink">Unanswered Questions Detected</p>
              <p className="text-ash mt-0.5">
                You have {totalUnanswered} unanswered {totalUnanswered === 1 ? 'question' : 'questions'}. Unanswered
                questions receive 0 marks.
              </p>
            </div>
          </div>
        )}

        {/* Questions Summary Table */}
        <div className="my-4 space-y-2 text-sm font-sans">
          <p className="text-xs font-semibold text-ash-muted uppercase tracking-wider mb-2">
            Attempt Summary
          </p>
          <div className="bg-white border border-hairline rounded divide-y divide-hairline">
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-ash">Total Questions</span>
              <span className="font-semibold text-ink">{summary.total}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5 text-emerald-700 bg-emerald-50/50">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                Answered
              </span>
              <span className="font-semibold">{totalAnswered}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5 text-amber-700">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                Unanswered / Visited
              </span>
              <span className="font-semibold">{summary.visited}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5 text-indigo-700">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                Marked for Review
              </span>
              <span className="font-semibold">{summary.markedReview + summary.answeredAndMarkedReview}</span>
            </div>
            {summary.notVisited > 0 && (
              <div className="flex justify-between items-center px-4 py-2.5 text-gray-600">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />
                  Not Visited
                </span>
                <span className="font-semibold">{summary.notVisited}</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-ash-muted mb-6">
          Are you sure you want to finish? You will not be able to change your answers once submitted.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="px-4 py-2 text-xs font-semibold rounded border border-hairline bg-white text-ink hover:bg-paper transition-colors disabled:opacity-50"
          >
            Return to Exam
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="px-5 py-2 text-xs font-semibold rounded bg-brick hover:bg-brick/90 text-white transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitPending ? (
              <span>Waiting for connection…</span>
            ) : isSubmitting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Submitting...</span>
              </>
            ) : (
              <span>Confirm & Submit</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
