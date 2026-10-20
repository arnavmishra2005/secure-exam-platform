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
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const OptionList: React.FC<OptionListProps> = ({
  questionId,
  type,
  options,
  selectedOptionIds = [],
  onSelectOption,
  disabled = false,
}) => {
  const isMulti = type === QuestionType.MCQ_MULTI;

  // Sort options by order if defined
  const sortedOptions = [...options].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="mt-4 space-y-3" role={isMulti ? 'group' : 'radiogroup'} aria-label="Question options">
      {sortedOptions.map((option, idx) => {
        const isSelected = selectedOptionIds.includes(option.id);
        const label = OPTION_LABELS[idx] || String(idx + 1);

        return (
          <label
            key={option.id}
            htmlFor={`opt-${option.id}`}
            onClick={(e) => {
              if (disabled) return;
              // Prevent native label double trigger
              e.preventDefault();
              onSelectOption(option.id, isMulti);
            }}
            className={`flex items-start gap-3.5 p-4 rounded border cursor-pointer transition-all select-none ${
              isSelected
                ? 'bg-verdigris-light/40 border-verdigris text-ink shadow-sm'
                : 'bg-white border-hairline/80 hover:border-hairline hover:bg-paper-raised text-ink'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {/* Visual indicator (Radio or Checkbox) */}
            <div className="flex items-center justify-center pt-0.5">
              <input
                id={`opt-${option.id}`}
                name={`question-${questionId}`}
                type={isMulti ? 'checkbox' : 'radio'}
                checked={isSelected}
                onChange={() => {}}
                disabled={disabled}
                className="sr-only"
                aria-checked={isSelected}
              />
              <div
                className={`w-5 h-5 flex items-center justify-center transition-colors ${
                  isMulti ? 'rounded-[3px]' : 'rounded-full'
                } border ${
                  isSelected
                    ? 'border-verdigris bg-verdigris text-white'
                    : 'border-ash-muted/50 bg-white hover:border-ash-muted'
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
                  ? 'bg-verdigris text-white'
                  : 'bg-paper text-ash-muted border border-hairline'
              }`}
            >
              {label}
            </span>

            {/* Option text content */}
            <span className="flex-1 text-sm leading-relaxed text-ink pt-0.5 font-sans">
              {option.text}
            </span>
          </label>
        );
      })}
    </div>
  );
};
