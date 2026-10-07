'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Exam,
  ExamStatus,
  QuestionWithOptions,
  UpdateExamRequest,
} from '@secure-exam/types';
import {
  closeExam,
  getExam,
  scheduleExam,
  startExam,
  updateExam,
} from '@/lib/api';
import { getExamQuestions, getQuestions, addQuestionToExam, removeQuestionFromExam } from '@/lib/api';
import { ExamForm } from '@/components/exam/ExamForm';
import { ExamStatusBadge } from '@/components/exam/ExamStatusBadge';

export default function ExamDetailPage({ params }: { params: { examId: string } }) {
  const { examId } = params;
  const [exam, setExam] = useState<Exam | null>(null);
  const [examQuestions, setExamQuestions] = useState<QuestionWithOptions[]>([]);
  const [allQuestions, setAllQuestions] = useState<QuestionWithOptions[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // True while an action (add/remove/schedule/save) is in flight.
  const [busy, setBusy] = useState(false);

  // Only the first load shows the full-page "Loading…". Refreshes after an action
  // update the data in place, so the page doesn't collapse and lose its scroll position.
  async function refresh() {
    try {
      const [examData, mapped, bank] = await Promise.all([
        getExam(examId),
        getExamQuestions(examId),
        getQuestions(),
      ]);
      setExam(examData);
      setExamQuestions(mapped);
      setAllQuestions(bank);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function withRefresh(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-10 text-sm text-stone-500">Loading…</div>;
  if (!exam) return <div className="mx-auto max-w-4xl px-6 py-10 text-sm text-rose-600">Exam not found.</div>;

  const availableToAdd = allQuestions.filter((q) => !examQuestions.some((eq) => eq.id === q.id));

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-10">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-stone-900">{exam.title}</h1>
          <ExamStatusBadge status={exam.status} />
        </div>
        {error && (
          <div className="mt-3 border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          {exam.status === ExamStatus.DRAFT && (
            <button
              onClick={() => withRefresh(() => scheduleExam(exam.id))}
              disabled={busy}
              className="bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Schedule
            </button>
          )}
          {exam.status === ExamStatus.SCHEDULED && (
            <button
              onClick={() => withRefresh(() => startExam(exam.id))}
              disabled={busy}
              className="bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Start
            </button>
          )}
          {exam.status === ExamStatus.ACTIVE && (
            <button
              onClick={() => withRefresh(() => closeExam(exam.id))}
              disabled={busy}
              className="bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Close
            </button>
          )}
          <Link
            href={`/exams/${exam.id}/assign`}
            className="border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            Manage students
          </Link>
        </div>
      </div>

      {exam.status === ExamStatus.DRAFT && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
            Edit details
          </h2>
          <ExamForm
            initial={exam}
            submitLabel="Save changes"
            onSubmit={(data: UpdateExamRequest) => withRefresh(() => updateExam(exam.id, data))}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
          Questions ({examQuestions.length})
        </h2>
        <ul className="divide-y divide-stone-100 border border-stone-200">
          {examQuestions.length === 0 && (
            <li className="px-4 py-4 text-sm text-stone-500">No questions added yet.</li>
          )}
          {examQuestions.map((q, i) => (
            <li key={q.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                <span className="mr-2 text-stone-400">{i + 1}.</span>
                {q.text}
              </span>
              <button
                onClick={() => withRefresh(() => removeQuestionFromExam(exam.id, q.id))}
                disabled={busy}
                className="text-xs text-rose-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        {availableToAdd.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-stone-700">Add from question bank</p>
            <ul className="divide-y divide-stone-100 border border-stone-200">
              {availableToAdd.map((q) => (
                <li key={q.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{q.text}</span>
                  <button
                    onClick={() => withRefresh(() => addQuestionToExam(exam.id, { questionId: q.id }))}
                    disabled={busy}
                    className="rounded-sm bg-indigo-600 px-2.5 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link href="/questions/new" className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
          + Create a new question
        </Link>
      </section>
    </div>
  );
}
