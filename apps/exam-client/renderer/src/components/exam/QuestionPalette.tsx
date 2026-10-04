/**
 * Owner: Person B
 * Question Palette: Visual grid color-coded according to the QuestionState enum.
 * Reuses QuestionState from @secure-exam/types directly.
 */
import React, { useState } from 'react';
import { QuestionState } from '@secure-exam/types';
import { PaletteFilter, PaletteSummary } from '../../types/ui.types';

interface QuestionPaletteProps {
  questionIds: string[];
  currentIndex: number;
  questionStates: Record<string, QuestionState>;
  onSelectQuestion: (index: number) => void;
  summary: PaletteSummary;
}

export const QuestionPalette: React.FC<QuestionPaletteProps> = ({
  questionIds,
  currentIndex,
  questionStates,
  onSelectQuestion,
  summary,
}) => {
  const [filter, setFilter] = useState<PaletteFilter>('ALL');

  // Compute styling class for a given state
  const getStateStyle = (state: QuestionState, isCurrent: boolean) => {
    let base = 'transition-transform duration-100 font-semibold text-sm';
    let ring = isCurrent ? 'ring-2 ring-ink ring-offset-2 scale-105 z-10' : '';

    switch (state) {
      case QuestionState.ANSWERED:
        return `${base} ${ring} bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700`;
      case QuestionState.VISITED:
        return `${base} ${ring} bg-amber-500 text-white border-amber-600 hover:bg-amber-600`;
      case QuestionState.MARKED_REVIEW:
        return `${base} ${ring} bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700`;
      case QuestionState.ANSWERED_AND_MARKED_REVIEW:
        return `${base} ${ring} bg-violet-600 text-white border-violet-700 hover:bg-violet-700 relative`;
      case QuestionState.NOT_VISITED:
      default:
        return `${base} ${ring} bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-300`;
    }
  };

  // Filter items if user selects filter tab
  const filteredIndices = questionIds.map((id, idx) => ({ id, idx })).filter(({ id }) => {
    const st = questionStates[id] || QuestionState.NOT_VISITED;
    if (filter === 'ALL') return true;
    if (filter === 'ANSWERED') {
      return st === QuestionState.ANSWERED || st === QuestionState.ANSWERED_AND_MARKED_REVIEW;
    }
    if (filter === 'REVIEW') {
      return st === QuestionState.MARKED_REVIEW || st === QuestionState.ANSWERED_AND_MARKED_REVIEW;
    }
    if (filter === 'UNANSWERED') {
      return st === QuestionState.NOT_VISITED || st === QuestionState.VISITED || st === QuestionState.MARKED_REVIEW;
    }
    return true;
  });

  return (
    <div className="bg-paper-raised border border-hairline rounded p-5 flex flex-col h-full select-none">
      <h3 className="font-serif font-bold text-base text-ink mb-3 pb-2 border-b border-hairline flex items-center justify-between">
        <span>Question Palette</span>
        <span className="text-xs font-sans font-medium text-ash-muted">
          {summary.answered + summary.answeredAndMarkedReview} / {summary.total} Answered
        </span>
      </h3>

      {/* Summary Legend */}
      <div className="space-y-1.5 text-xs font-medium mb-4 pb-3 border-b border-hairline">
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-sm bg-emerald-600 shrink-0 inline-block" />
            <span className="text-ash">Answered</span>
          </div>
          <span className="font-semibold text-ink px-1.5 py-0.5 rounded bg-white border border-hairline text-[11px] min-w-[24px] text-center">
            {summary.answered}
          </span>
        </div>

        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-sm bg-amber-500 shrink-0 inline-block" />
            <span className="text-ash">Not Answered</span>
          </div>
          <span className="font-semibold text-ink px-1.5 py-0.5 rounded bg-white border border-hairline text-[11px] min-w-[24px] text-center">
            {summary.visited}
          </span>
        </div>

        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-sm bg-indigo-600 shrink-0 inline-block" />
            <span className="text-ash">Marked for Review</span>
          </div>
          <span className="font-semibold text-ink px-1.5 py-0.5 rounded bg-white border border-hairline text-[11px] min-w-[24px] text-center">
            {summary.markedReview}
          </span>
        </div>

        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-sm bg-violet-600 shrink-0 inline-block relative">
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-300 ring-1 ring-white" />
            </span>
            <span className="text-ash">Answered & Marked Review</span>
          </div>
          <span className="font-semibold text-ink px-1.5 py-0.5 rounded bg-white border border-hairline text-[11px] min-w-[24px] text-center">
            {summary.answeredAndMarkedReview}
          </span>
        </div>

        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-sm bg-gray-200 border border-gray-300 shrink-0 inline-block" />
            <span className="text-ash">Not Visited</span>
          </div>
          <span className="font-semibold text-ink px-1.5 py-0.5 rounded bg-white border border-hairline text-[11px] min-w-[24px] text-center">
            {summary.notVisited}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-3 text-xs border border-hairline rounded p-0.5 bg-paper">
        {(['ALL', 'ANSWERED', 'REVIEW', 'UNANSWERED'] as PaletteFilter[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-1 px-1.5 rounded text-[11px] font-semibold transition-colors capitalize ${
              filter === tab ? 'bg-white shadow-sm text-ink' : 'text-ash-muted hover:text-ink'
            }`}
          >
            {tab.toLowerCase()}
          </button>
        ))}
      </div>

      {/* Question Number Buttons Grid */}
      <div className="flex-1 overflow-y-auto max-h-[360px] pr-1">
        <div className="grid grid-cols-5 gap-2">
          {filteredIndices.map(({ id, idx }) => {
            const state = questionStates[id] || QuestionState.NOT_VISITED;
            const isCurrent = idx === currentIndex;

            return (
              <button
                key={id}
                onClick={() => onSelectQuestion(idx)}
                className={`w-9 h-9 rounded flex items-center justify-center border shadow-xs ${getStateStyle(
                  state,
                  isCurrent,
                )}`}
                title={`Question ${idx + 1}: ${state.replace(/_/g, ' ')}`}
                aria-label={`Go to question ${idx + 1}`}
              >
                {idx + 1}
                {state === QuestionState.ANSWERED_AND_MARKED_REVIEW && (
                  <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-300 ring-1 ring-white" />
                )}
              </button>
            );
          })}
        </div>

        {filteredIndices.length === 0 && (
          <p className="text-center text-xs text-ash-muted py-6">No questions match this filter.</p>
        )}
      </div>
    </div>
  );
};
