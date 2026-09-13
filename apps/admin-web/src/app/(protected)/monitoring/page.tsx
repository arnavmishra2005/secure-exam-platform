'use client';

import { useCallback, useEffect, useState } from 'react';
import { listAttempts, type PaginatedAttempts } from '@secure-exam/api-client';
import type { AttemptStatus } from '@secure-exam/types';

const POLL_INTERVAL_MS = 10_000;

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function StatusBadge({ status, isOverdue }: { status: AttemptStatus; isOverdue: boolean }) {
  const styles: Record<string, string> = {
    IN_PROGRESS: 'bg-green-100 text-green-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
    AUTO_SUBMITTED: 'bg-amber-100 text-amber-800',
  };
  if (isOverdue) {
    // Timer has already hit zero but the row hasn't been finalized yet —
    // either the periodic expiry sweep hasn't reached it, or nobody has
    // touched the attempt to trigger the lazy auto-submit path. Distinct
    // from a genuinely live attempt so the admin isn't misled.
    return (
      <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
        Closing out…
      </span>
    );
  }
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

/**
 * Owner: Person C. Consumes GET /attempts (attempt.controller.ts, admin-only)
 * via packages/api-client/attempt.api.ts#listAttempts.
 *
 * Uses plain polling rather than React Query/SWR to avoid assuming that
 * dependency is already installed — see integration notes for the drop-in
 * upgrade path if the team adopts one.
 */
export default function MonitoringPage() {
  const [data, setData] = useState<PaginatedAttempts | null>(null);
  const [examId, setExamId] = useState('');
  const [status, setStatus] = useState<AttemptStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await listAttempts({
        examId: examId || undefined,
        status: (status || undefined) as AttemptStatus | undefined,
        limit: 50,
      });
      setData(result);
      setError(null);
    } catch {
      setError('Could not load active attempts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [examId, status]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Live Monitoring</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="rounded border px-3 py-1.5 text-sm"
          placeholder="Filter by exam ID"
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
        />
        <select
          className="rounded border px-3 py-1.5 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as AttemptStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="AUTO_SUBMITTED">Auto-submitted</option>
        </select>
        <button className="rounded border px-3 py-1.5 text-sm" onClick={load}>
          Refresh
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">Attempt</th>
              <th className="px-3 py-2">Exam</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Time left</th>
              <th className="px-3 py-2">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={6}>
                  No attempts match this filter.
                </td>
              </tr>
            )}
            {data?.items.map((attempt) => (
              <tr key={attempt.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{attempt.id.slice(0, 8)}…</td>
                <td className="px-3 py-2 font-mono text-xs">{attempt.examId.slice(0, 8)}…</td>
                <td className="px-3 py-2 font-mono text-xs">{attempt.studentId.slice(0, 8)}…</td>
                <td className="px-3 py-2">
                  <StatusBadge status={attempt.status} isOverdue={attempt.isOverdue} />
                </td>
                <td className="px-3 py-2">
                  {attempt.status === 'IN_PROGRESS' ? formatRemaining(attempt.remainingSeconds) : '—'}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {attempt.lastSeenAt ? new Date(attempt.lastSeenAt).toLocaleTimeString() : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && (
        <p className="mt-3 text-xs text-gray-500">
          Showing {data.items.length} of {data.total} attempts. Auto-refreshes every {POLL_INTERVAL_MS / 1000}s.
        </p>
      )}

      <p className="mt-2 text-xs text-gray-400">
        Student/exam IDs are shown truncated until name lookups are wired in from the Student and Exam modules.
      </p>
    </div>
  );
}
