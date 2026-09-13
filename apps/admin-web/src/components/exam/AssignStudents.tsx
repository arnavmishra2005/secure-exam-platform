'use client';

import { FormEvent, useState } from 'react';
import { ExamAssignment, StudentLookupResponse } from '@secure-exam/types';
import { lookupStudentByCollegeId, assignStudent } from '@/lib/api';

interface Props {
  examId: string;
  assignments: ExamAssignment[];
  onAssign: (studentId: string) => Promise<void>;
  onUnassign: (studentId: string) => Promise<void>;
}

/**
 * Assign students to an exam by College ID.
 * Flow:
 *  1. Admin types a College ID (e.g. "CS2021001") and clicks "Look up"
 *  2. We resolve it to a student record → show name/email preview
 *  3. Admin confirms → UUID is sent to the backend assignment endpoint
 */
export function AssignStudents({ examId, assignments, onAssign, onUnassign }: Props) {
  const [collegeId, setCollegeId] = useState('');
  const [preview, setPreview] = useState<StudentLookupResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    const trimmed = collegeId.trim();
    if (!trimmed) return;
    setLookupError(null);
    setAssignError(null);
    setPreview(null);
    setLooking(true);
    try {
      const result = await lookupStudentByCollegeId(trimmed);
      if (!result) {
        setLookupError(`No student found with college ID "${trimmed}". Add the student in the Students section first.`);
      } else {
        setPreview(result);
      }
    } catch {
      setLookupError('Could not reach the server. Please try again.');
    } finally {
      setLooking(false);
    }
  }

  async function handleAssign() {
    if (!preview) return;
    setAssignError(null);
    setSubmitting(true);
    try {
      await onAssign(preview.id);
      // Reset form on success
      setCollegeId('');
      setPreview(null);
    } catch (err) {
      setAssignError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClearPreview() {
    setPreview(null);
    setLookupError(null);
    setAssignError(null);
    setCollegeId('');
  }

  const alreadyAssigned = preview
    ? assignments.some((a) => a.studentId === preview.id)
    : false;

  return (
    <div className="space-y-6">
      {/* ── Lookup form ── */}
      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">Add student by college ID</p>
        <form onSubmit={handleLookup} className="flex gap-2">
          <input
            value={collegeId}
            onChange={(e) => {
              setCollegeId(e.target.value);
              setPreview(null);
              setLookupError(null);
              setAssignError(null);
            }}
            placeholder="e.g. CS2021001"
            disabled={looking}
            className="flex-1 border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={looking || !collegeId.trim()}
            className="border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50 disabled:opacity-50"
          >
            {looking ? 'Looking up…' : 'Look up'}
          </button>
        </form>

        {/* Lookup error */}
        {lookupError && (
          <p className="mt-2 text-sm text-rose-600">{lookupError}</p>
        )}

        {/* Preview card */}
        {preview && (
          <div className="mt-3 rounded border border-stone-200 bg-stone-50 px-4 py-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-stone-900">{preview.fullName}</p>
                <p className="text-xs text-stone-500">{preview.email}</p>
                <p className="mt-0.5 font-mono text-xs text-stone-400">
                  College ID: {preview.collegeId}
                </p>
                {!preview.isActive && (
                  <p className="mt-1 text-xs font-medium text-amber-600">
                    ⚠ This student account is inactive
                  </p>
                )}
              </div>
              <button
                onClick={handleClearPreview}
                className="text-xs text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            {alreadyAssigned ? (
              <p className="mt-3 text-xs font-medium text-amber-600">
                This student is already assigned to this exam.
              </p>
            ) : (
              <button
                onClick={handleAssign}
                disabled={submitting}
                className="mt-3 bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Assigning…' : `Assign ${preview.fullName}`}
              </button>
            )}

            {assignError && (
              <p className="mt-2 text-xs text-rose-600">{assignError}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Assigned students list ── */}
      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">
          Assigned students ({assignments.length})
        </p>
        <ul className="divide-y divide-stone-100 border border-stone-200">
          {assignments.length === 0 && (
            <li className="px-4 py-4 text-sm text-stone-400">
              No students assigned yet. Use the lookup above to add students.
            </li>
          )}
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                {a.studentInfo ? (
                  <>
                    <span className="font-medium text-stone-800">{a.studentInfo.fullName}</span>
                    <span className="ml-2 font-mono text-xs text-stone-400">
                      {a.studentInfo.collegeId}
                    </span>
                    <p className="text-xs text-stone-400">{a.studentInfo.email}</p>
                  </>
                ) : (
                  <span className="font-mono text-xs text-stone-500">{a.studentId}</span>
                )}
              </div>
              <button
                onClick={() => onUnassign(a.studentId)}
                className="ml-4 shrink-0 text-xs text-rose-600 hover:underline"
              >
                Unassign
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
