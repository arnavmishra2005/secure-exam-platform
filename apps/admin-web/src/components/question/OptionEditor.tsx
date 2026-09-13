'use client';

import { QuestionType } from '@secure-exam/types';

export interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

interface Props {
  type: QuestionType;
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
}

export function OptionEditor({ type, options, onChange }: Props) {
  const isSingleSelect = type === QuestionType.MCQ_SINGLE || type === QuestionType.TRUE_FALSE;

  function updateText(index: number, text: string) {
    const next = options.slice();
    next[index] = { ...next[index], text };
    onChange(next);
  }

  function toggleCorrect(index: number) {
    let next = options.slice();
    if (isSingleSelect) {
      next = next.map((o, i) => ({ ...o, isCorrect: i === index }));
    } else {
      next[index] = { ...next[index], isCorrect: !next[index].isCorrect };
    }
    onChange(next);
  }

  function removeOption(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }

  function addOption() {
    onChange([...options, { text: '', isCorrect: false }]);
  }

  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type={isSingleSelect ? 'radio' : 'checkbox'}
            name="correct-option"
            checked={opt.isCorrect}
            onChange={() => toggleCorrect(i)}
            className="h-4 w-4"
            title="Mark as correct"
          />
          <input
            value={opt.text}
            onChange={(e) => updateText(i, e.target.value)}
            placeholder={`Option ${i + 1}`}
            className="flex-1 border border-stone-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            disabled={type === QuestionType.TRUE_FALSE}
          />
          {type !== QuestionType.TRUE_FALSE && options.length > 2 && (
            <button
              type="button"
              onClick={() => removeOption(i)}
              className="text-xs text-rose-600 hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      ))}

      {type !== QuestionType.TRUE_FALSE && (
        <button
          type="button"
          onClick={addOption}
          className="text-sm text-indigo-600 hover:underline"
        >
          + Add option
        </button>
      )}

      <p className="text-xs text-stone-500">
        {type === QuestionType.MCQ_SINGLE && 'Select exactly one correct option.'}
        {type === QuestionType.MCQ_MULTI && 'Select one or more correct options.'}
        {type === QuestionType.TRUE_FALSE && 'Select which of True/False is correct.'}
      </p>
    </div>
  );
}
