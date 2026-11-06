/**
 * Owner: Person B
 * Renders the options for a question (Single choice, Multi choice, True/False)
 */
import React from 'react';
import { PublicOption, QuestionType } from '@secure-exam/types';

interface OptionListProps {
  questionId: string;
  type: QuestionType;
  options: PublicOption[];
  selectedOptionIds: string[];
  onSelectOption: (optionId: string, isMulti: boolean) => void;
  disabled?: boolean;
  /** Only supplied by the published-result review. */
  correctOptionIds?: string[];
  review?: boolean;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const OptionList: React.FC<OptionListProps> = ({
  questionId,
  type,
  options,
  selectedOptionIds = [],
  onSelectOption,
  disabled = false,
  correctOptionIds,
  review = false,
}) => {
  const isMulti = type === QuestionType.MCQ_MULTI;

  // Sort options by order if defined
  const sortedOptions = [...options].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="mt-4 space-y-3" role={isMulti ? 'group' : 'radiogroup'} aria-label="Question options">
      {sortedOptions.map((option, idx) => {
        const isSelected = selectedOptionIds.includes(option.id);
        const label = OPTION_LABELS[idx] || String(idx + 1);
        const correct = correctOptionIds?.includes(option.id) === true;
        const wrong = correctOptionIds !== undefined && isSelected && !correct;
        const feedback = correct ? (isSelected ? 'Correct · Your answer' : 'Correct answer · Not selected')
          : wrong ? 'Incorrect · Your answer' : review && isSelected ? 'Your answer' : null;
        const tone = correct ? 'border-emerald-600 bg-emerald-500/10'
          : wrong ? 'border-red-600 bg-red-500/10'
          : isSelected && review ? 'border-slate-500 bg-slate-500/10'
          : isSelected ? 'bg-primary/10 border-primary'
          : review ? 'bg-card border-border' : 'bg-card border-border hover:border-primary hover:bg-muted';
        const selectedTone = correct ? 'bg-emerald-700 border-emerald-700 text-white'
          : wrong ? 'bg-red-700 border-red-700 text-white'
          : review ? 'bg-slate-600 border-slate-600 text-white' : 'border-verdigris bg-verdigris text-white';

        return (
          <label
            key={option.id}
            htmlFor={`opt-${option.id}`}
            className={`flex items-start gap-3.5 p-4 rounded border transition-all select-none focus-within:ring-2 focus-within:ring-ring ${tone} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {/* Visual indicator (Radio or Checkbox) */}
            <div className="flex items-center justify-center pt-0.5">
              <input
                id={`opt-${option.id}`}
                name={`question-${questionId}`}
                type={isMulti ? 'checkbox' : 'radio'}
                checked={isSelected}
                onChange={() => onSelectOption(option.id, isMulti)}
                disabled={disabled}
                className="sr-only"
                aria-checked={isSelected}
              />
              <div
                className={`w-5 h-5 flex items-center justify-center transition-colors ${
                  isMulti ? 'rounded-[3px]' : 'rounded-full'
                } border ${
                  isSelected
                    ? selectedTone
                    : 'border-border bg-background hover:border-primary'
                }`}
              >
                {isSelected && (
                  isMulti ? (
                    <svg className="w-3.5 h-3.5 stroke-current stroke-[2.5]" fill="none" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )
                )}
              </div>
            </div>

            {/* Option letter pill (A, B, C, D) */}
            <span
              className={`inline-flex items-center justify-center w-6 h-6 text-xs font-semibold rounded shrink-0 transition-colors ${
                isSelected
                  ? selectedTone
                  : 'bg-paper text-ash-muted border border-hairline'
              }`}
            >
              {label}
            </span>

            {/* Option text content */}
            <span className="flex-1 text-sm leading-relaxed text-foreground pt-0.5 font-sans">
              {option.text}
              {feedback && <span className={`mt-1 block text-xs font-semibold ${correct ? 'text-emerald-700 dark:text-emerald-400' : wrong ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}>{feedback}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
};
