'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CreateQuestionRequest, QuestionType, QuestionWithOptions } from '@secure-exam/types';
import { OptionEditor, OptionDraft } from './OptionEditor';

interface Props {
  initial?: QuestionWithOptions;
  onSubmit: (data: CreateQuestionRequest) => Promise<void>;
  submitLabel?: string;
}

function defaultOptionsFor(type: QuestionType): OptionDraft[] {
  if (type === QuestionType.TRUE_FALSE) {
    return [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ];
  }
  return [
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ];
}

export function QuestionForm({ initial, onSubmit, submitLabel = 'Save question' }: Props) {
  const [text, setText] = useState(initial?.text ?? '');
  const [type, setType] = useState<QuestionType>(initial?.type ?? QuestionType.MCQ_SINGLE);
  const [marks, setMarks] = useState(initial?.marks ?? 1);
  const [negativeMarks, setNegativeMarks] = useState(initial?.negativeMarks ?? 0);
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [options, setOptions] = useState<OptionDraft[]>(
    initial?.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) ?? defaultOptionsFor(type),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset options to a sensible default whenever the question type changes,
  // unless we're editing an existing question of that same type.
  useEffect(() => {
    if (!initial || initial.type !== type) {
      setOptions(defaultOptionsFor(type));
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  function validate(): string | null {
    if (!text.trim()) return 'Question text is required';
    if (marks <= 0) return 'Marks must be greater than 0';
    const filled = options.filter((o) => o.text.trim());
    if (filled.length < 2) return 'At least two options are required';

    const correctCount = filled.filter((o) => o.isCorrect).length;
    if (type === QuestionType.MCQ_SINGLE && correctCount !== 1) {
      return 'MCQ (single answer) needs exactly one correct option';
    }
    if (type === QuestionType.MCQ_MULTI && correctCount < 1) {
      return 'MCQ (multiple answer) needs at least one correct option';
    }
    if (type === QuestionType.TRUE_FALSE && (filled.length !== 2 || correctCount !== 1)) {
      return 'True/False needs exactly one correct option';
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) return setError(validationError);
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit({
        text: text.trim(),
        type,
        marks: Number(marks),
        negativeMarks: negativeMarks ? Number(negativeMarks) : undefined,
        explanation: explanation.trim() || undefined,
        options: options
          .filter((o) => o.text.trim())
          .map((o, i) => ({ text: o.text.trim(), isCorrect: o.isCorrect, order: i })),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      {error && (
        <div className="border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-stone-700">Question text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="mt-1 w-full border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          placeholder="What is a binary search tree?"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as QuestionType)}
            className="mt-1 w-full border border-stone-300 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value={QuestionType.MCQ_SINGLE}>MCQ — single answer</option>
            <option value={QuestionType.MCQ_MULTI}>MCQ — multiple answer</option>
            <option value={QuestionType.TRUE_FALSE}>True / False</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Marks</label>
          <input
            type="number"
            min={0}
            step="0.5"
            value={marks}
            onChange={(e) => setMarks(Number(e.target.value))}
            className="mt-1 w-full border border-stone-300 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Negative marks</label>
          <input
            type="number"
            min={0}
            step="0.25"
            value={negativeMarks}
            onChange={(e) => setNegativeMarks(Number(e.target.value))}
            className="mt-1 w-full border border-stone-300 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700">Options</label>
        <div className="mt-1">
          <OptionEditor type={type} options={options} onChange={setOptions} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700">Explanation (optional, admin-only)</label>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={2}
          className="mt-1 w-full border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
