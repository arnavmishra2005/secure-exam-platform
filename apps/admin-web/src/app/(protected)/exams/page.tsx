'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Exam } from '@secure-exam/types';
import { closeExam, getExams, scheduleExam, startExam } from '@/lib/api';
import { ExamTable } from '@/components/exam/ExamTable';

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setExams(await getExams());
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

  async function withRefresh(action: () => Promise<unknown>) {
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Exams</h1>
          <p className="text-sm text-stone-500">Create, schedule, and run exams.</p>
        </div>
        <Link
          href="/exams/new"
          className="bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New exam
        </Link>
      </div>

      {error && (
        <div className="mb-4 border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : (
        <ExamTable
          exams={exams}
          onSchedule={(id) => withRefresh(() => scheduleExam(id))}
          onStart={(id) => withRefresh(() => startExam(id))}
          onClose={(id) => withRefresh(() => closeExam(id))}
        />
      )}
    </div>
  );
}
