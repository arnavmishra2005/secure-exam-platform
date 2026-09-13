'use client';

import Link from 'next/link';
import { Exam, ExamStatus } from '@secure-exam/types';
import { ExamStatusBadge } from './ExamStatusBadge';

interface Props {
  exams: Exam[];
  onSchedule: (id: string) => void;
  onStart: (id: string) => void;
  onClose: (id: string) => void;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function ExamTable({ exams, onSchedule, onStart, onClose }: Props) {
  if (exams.length === 0) {
    return (
      <div className="border border-dashed border-stone-300 px-6 py-12 text-center text-sm text-stone-500">
        No exams yet. Create one to get started.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-300 text-left text-xs uppercase tracking-wide text-stone-400">
          <th className="py-2 pr-4 font-medium">Exam</th>
          <th className="py-2 pr-4 font-medium">Status</th>
          <th className="py-2 pr-4 font-medium">Duration</th>
          <th className="py-2 pr-4 font-medium">Start</th>
          <th className="py-2 pr-4 font-medium">End</th>
          <th className="py-2 pr-0 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {exams.map((exam) => (
          <tr key={exam.id} className="border-b border-stone-100">
            <td className="py-3 pr-4">
              <Link href={`/exams/${exam.id}`} className="font-medium text-stone-800 hover:underline">
                {exam.title}
              </Link>
            </td>
            <td className="py-3 pr-4">
              <ExamStatusBadge status={exam.status} />
            </td>
            <td className="py-3 pr-4 text-stone-600">{exam.durationMinutes} min</td>
            <td className="py-3 pr-4 text-stone-600">{formatDateTime(exam.startTime)}</td>
            <td className="py-3 pr-4 text-stone-600">{formatDateTime(exam.endTime)}</td>
            <td className="py-3 pr-0 text-right">
              <div className="flex justify-end gap-2">
                {exam.status === ExamStatus.DRAFT && (
                  <>
                    <Link
                      href={`/exams/${exam.id}`}
                      className="rounded-sm border border-stone-300 px-2.5 py-1 text-xs hover:bg-stone-50"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => onSchedule(exam.id)}
                      className="rounded-sm bg-indigo-600 px-2.5 py-1 text-xs text-white hover:bg-indigo-700"
                    >
                      Schedule
                    </button>
                  </>
                )}
                {exam.status === ExamStatus.SCHEDULED && (
                  <button
                    onClick={() => onStart(exam.id)}
                    className="rounded-sm bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700"
                  >
                    Start
                  </button>
                )}
                {exam.status === ExamStatus.ACTIVE && (
                  <button
                    onClick={() => onClose(exam.id)}
                    className="rounded-sm bg-rose-600 px-2.5 py-1 text-xs text-white hover:bg-rose-700"
                  >
                    Close
                  </button>
                )}
                <Link
                  href={`/exams/${exam.id}`}
                  className="rounded-sm border border-stone-300 px-2.5 py-1 text-xs hover:bg-stone-50"
                >
                  View
                </Link>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
