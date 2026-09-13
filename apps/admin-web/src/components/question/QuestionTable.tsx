'use client';

import Link from 'next/link';
import { QuestionWithOptions } from '@secure-exam/types';

interface Props {
  questions: QuestionWithOptions[];
  onDelete: (id: string) => void;
  /** When provided, shows an "Add to exam" action per row (used from the exam detail page). */
  onAddToExam?: (questionId: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  MCQ_SINGLE: 'MCQ · single',
  MCQ_MULTI: 'MCQ · multi',
  TRUE_FALSE: 'True/False',
};

export function QuestionTable({ questions, onDelete, onAddToExam }: Props) {
  if (questions.length === 0) {
    return (
      <div className="border border-dashed border-stone-300 px-6 py-12 text-center text-sm text-stone-500">
        No questions yet.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-300 text-left text-xs uppercase tracking-wide text-stone-400">
          <th className="py-2 pr-4 font-medium">Question</th>
          <th className="py-2 pr-4 font-medium">Type</th>
          <th className="py-2 pr-4 font-medium">Marks</th>
          <th className="py-2 pr-4 font-medium">Options</th>
          <th className="py-2 pr-0 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {questions.map((q) => (
          <tr key={q.id} className="border-b border-stone-100 align-top">
            <td className="max-w-md py-3 pr-4 text-stone-800">{q.text}</td>
            <td className="py-3 pr-4 text-stone-600">{TYPE_LABELS[q.type] ?? q.type}</td>
            <td className="py-3 pr-4 text-stone-600">
              {q.marks}
              {q.negativeMarks ? ` (−${q.negativeMarks})` : ''}
            </td>
            <td className="py-3 pr-4 text-stone-600">
              <ul className="space-y-0.5">
                {q.options.map((o) => (
                  <li key={o.id} className={o.isCorrect ? 'font-medium text-emerald-700' : ''}>
                    {o.isCorrect ? '✓ ' : '· '}
                    {o.text}
                  </li>
                ))}
              </ul>
            </td>
            <td className="py-3 pr-0 text-right">
              <div className="flex justify-end gap-2">
                {onAddToExam && (
                  <button
                    onClick={() => onAddToExam(q.id)}
                    className="rounded-sm bg-indigo-600 px-2.5 py-1 text-xs text-white hover:bg-indigo-700"
                  >
                    Add to exam
                  </button>
                )}
                <Link
                  href={`/questions/${q.id}`}
                  className="rounded-sm border border-stone-300 px-2.5 py-1 text-xs hover:bg-stone-50"
                >
                  Edit
                </Link>
                <button
                  onClick={() => onDelete(q.id)}
                  className="rounded-sm border border-rose-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
