'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { QuestionWithOptions } from '@secure-exam/types';
import { deleteQuestion, getQuestions } from '@/lib/api';
import { QuestionTable } from '@/components/question/QuestionTable';

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      setQuestions(await getQuestions());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(id: string) {
    try {
      await deleteQuestion(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Question bank</h1>
          <p className="text-sm text-stone-500">Reusable questions available to any exam.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/questions/import"
            className="border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
          >
            Bulk import
          </Link>
          <Link
            href="/questions/new"
            className="bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New question
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : (
        <QuestionTable questions={questions} onDelete={handleDelete} />
      )}
    </div>
  );
}
