/** Owner: Person B. Options for MCQ / True-False questions. */
import { QuestionType, type CreateOptionRequest } from '@secure-exam/types';
import { Button, Input } from '../ui';

export function defaultOptionsFor(type: QuestionType): CreateOptionRequest[] {
  if (type === QuestionType.TRUE_FALSE) {
    return [
      { text: 'True', isCorrect: true, order: 0 },
      { text: 'False', isCorrect: false, order: 1 },
    ];
  }
  return [0, 1, 2, 3].map((i) => ({ text: '', isCorrect: i === 0 && type === QuestionType.MCQ_SINGLE, order: i }));
}

/** Same rules as the API (option-rules.ts); null when valid. */
export function optionsError(type: QuestionType, options: CreateOptionRequest[]): string | null {
  const filled = options.filter((o) => o.text.trim() !== '');
  if (filled.length < 2) return 'Add at least two options.';
  if (filled.length !== options.length) return 'Remove empty options or fill them in.';
  const correct = options.filter((o) => o.isCorrect).length;
  if ((type === QuestionType.MCQ_SINGLE || type === QuestionType.TRUE_FALSE) && correct !== 1) {
    return 'Mark exactly one option as correct.';
  }
  if (type === QuestionType.MCQ_MULTI && correct < 1) return 'Mark at least one option as correct.';
  if (type === QuestionType.TRUE_FALSE && options.length !== 2) return 'True / False needs exactly two options.';
  return null;
}

export function OptionEditor({
  type,
  options,
  onChange,
  disabled,
}: {
  type: QuestionType;
  options: CreateOptionRequest[];
  onChange: (options: CreateOptionRequest[]) => void;
  disabled?: boolean;
}) {
  const single = type !== QuestionType.MCQ_MULTI;
  const fixed = type === QuestionType.TRUE_FALSE;
  const renumber = (list: CreateOptionRequest[]) => list.map((o, i) => ({ ...o, order: i }));

  const setCorrect = (i: number, checked: boolean) =>
    onChange(options.map((o, j) => (single ? { ...o, isCorrect: j === i } : j === i ? { ...o, isCorrect: checked } : o)));

  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type={single ? 'radio' : 'checkbox'}
            name="correct-option"
            aria-label={`Option ${i + 1} is correct`}
            checked={o.isCorrect}
            disabled={disabled}
            onChange={(e) => setCorrect(i, e.target.checked)}
          />
          <Input
            aria-label={`Option ${i + 1}`}
            value={o.text}
            disabled={disabled || fixed}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
          />
          {!fixed && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled || options.length <= 2}
              onClick={() => onChange(renumber(options.filter((_, j) => j !== i)))}
              aria-label={`Remove option ${i + 1}`}
            >
              ✕
            </Button>
          )}
        </div>
      ))}
      {!fixed && (
        <Button
          size="sm"
          disabled={disabled || options.length >= 10}
          onClick={() => onChange(renumber([...options, { text: '', isCorrect: false, order: options.length }]))}
        >
          Add option
        </Button>
      )}
      <p className="text-xs text-slate-500">
        {single ? 'Select the one correct option.' : 'Tick every correct option. Students must pick exactly these to score.'}
      </p>
    </div>
  );
}
