/**
 * Owner: Person B
 * Renders the question header, text, marks metadata, and options list.
 */
import React from 'react';
import { PublicQuestion, QuestionType } from '@secure-exam/types';
import { OptionList } from './OptionList';

interface QuestionRendererProps {
  question: PublicQuestion;
  questionNumber: number;
  totalQuestions: number;
  selectedOptionIds: string[];
  textResponse: string;
  onSelectOption: (optionId: string, isMulti: boolean) => void;
  onTextResponseChange: (text: string) => void;
  disabled?: boolean;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  questionNumber,
  totalQuestions,
  selectedOptionIds,
  textResponse,
  onSelectOption,
  onTextResponseChange,
  disabled = false,
}) => {
  const getTypeBadge = (type: QuestionType) => {
    switch (type) {
      case QuestionType.MCQ_SINGLE:
        return { label: 'Single Choice', classes: 'bg-verdigris-light/60 text-verdigris-dark border-verdigris/30' };
      case QuestionType.MCQ_MULTI:
        return { label: 'Multiple Choice (Select all that apply)', classes: 'bg-gold-light/60 text-gold border-gold/40' };
      case QuestionType.TRUE_FALSE:
        return { label: 'True / False', classes: 'bg-ash-light text-ash border-hairline' };
      default:
        return { label: type, classes: 'bg-ash-light text-ash' };
    }
  };

  const badge = getTypeBadge(question.type);

  return (
    <div className="bg-paper-raised border border-hairline rounded p-6 sm:p-8 shadow-none transition-all">
      {/* Question Header & Meta */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-hairline">
        <div className="flex items-center gap-3">
          <span className="font-serif font-bold text-lg text-ink">
            Question {questionNumber} <span className="text-ash-muted font-normal text-sm">of {totalQuestions}</span>
          </span>
          <span className={`text-xs px-2.5 py-0.5 rounded border font-medium ${badge.classes}`}>
            {badge.label}
          </span>
        </div>

        {/* Marks indicators */}
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
            +{question.marks} {question.marks === 1 ? 'Mark' : 'Marks'}
          </span>
          {question.negativeMarks !== undefined && question.negativeMarks > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
              -{question.negativeMarks} Neg
            </span>
          )}
        </div>
      </div>

      {/* Question Text */}
      <div className="py-5 font-serif text-base sm:text-lg leading-relaxed text-ink whitespace-pre-wrap">
        {question.text}
      </div>

      {/* Options list for Objective questions */}
      {question.options && question.options.length > 0 && (
        <OptionList
          questionId={question.id}
          type={question.type}
          options={question.options}
          selectedOptionIds={selectedOptionIds}
          onSelectOption={onSelectOption}
          disabled={disabled}
        />
      )}

      {/* Free text response for Subjective questions */}
      {(!question.options || question.options.length === 0) && (
        <div className="mt-4">
          <label htmlFor={`text-${question.id}`} className="block text-xs font-semibold text-ash-muted uppercase tracking-wider mb-2">
            Your Written Response
          </label>
          <textarea
            id={`text-${question.id}`}
            value={textResponse}
            onChange={(e) => onTextResponseChange(e.target.value)}
            disabled={disabled}
            rows={6}
            placeholder="Type your answer here..."
            className="w-full p-4 border border-hairline rounded bg-white font-sans text-sm text-ink focus:outline-none focus:border-verdigris focus:ring-1 focus:ring-verdigris disabled:opacity-60"
          />
        </div>
      )}
    </div>
  );
};
