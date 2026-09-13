'use client';

import { useEffect, useState } from 'react';
import { ExamAssignment } from '@secure-exam/types';
import { assignStudent, getAssignedStudents, unassignStudent } from '@/lib/api';
import { AssignStudents } from '@/components/exam/AssignStudents';

export default function AssignStudentsPage({ params }: { params: { examId: string } }) {
  const { examId } = params;
  const [assignments, setAssignments] = useState<ExamAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      setAssignments(await getAssignedStudents(examId));
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

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-1 text-xl font-semibold text-stone-900">Manage students</h1>
      <p className="mb-6 text-sm text-stone-500">
        Students assigned here will be allowed to attempt this exam once it's active.
      </p>

      {error && (
        <div className="mb-4 border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : (
        <AssignStudents
          examId={examId}
          assignments={assignments}
          onAssign={async (studentId) => {
            await assignStudent(examId, { studentId });
            await refresh();
          }}
          onUnassign={async (studentId) => {
            await unassignStudent(examId, studentId);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
