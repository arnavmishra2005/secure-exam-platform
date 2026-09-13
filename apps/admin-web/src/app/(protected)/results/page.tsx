'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listSubmissions,
  overrideResultScore,
  publishResult,
  unpublishResult,
  type PaginatedSubmissions,
} from '@secure-exam/api-client';

/**
 * Owner: Person C. Consumes GET/PATCH/POST /submissions (submission.controller.ts,
 * SubmissionAdminController, admin-only) via packages/api-client/attempt.api.ts.
 */
export default function ResultsPage() {
  const [data, setData] = useState<PaginatedSubmissions | null>(null);
  const [examId, setExamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAttemptId, setBusyAttemptId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listSubmissions({ examId: examId || undefined, limit: 50 });
      setData(result);
      setError(null);
    } catch {
      setError('Could not load submissions.');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleTogglePublish(attemptId: string, currentlyPublished: boolean) {
    setBusyAttemptId(attemptId);
    try {
      if (currentlyPublished) {
        await unpublishResult(attemptId);
      } else {
        await publishResult(attemptId);
      }
      await load();
    } catch {
      setError('Could not update publish status.');
    } finally {
      setBusyAttemptId(null);
    }
  }

  async function handleScoreEdit(attemptId: string, currentScore: number) {
    const input = window.prompt('Enter the new score for this attempt:', String(currentScore));
    if (input === null) return;
    const parsed = Number(input);
    if (Number.isNaN(parsed) || parsed < 0) {
      setError('Score must be a non-negative number.');
      return;
    }
    setBusyAttemptId(attemptId);
    try {
      await overrideResultScore(attemptId, parsed);
      await load();
    } catch {
      setError('Could not update the score.');
    } finally {
      setBusyAttemptId(null);
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Submissions &amp; Results</h1>

      <div className="mb-4 flex gap-3">
        <input
          className="rounded border px-3 py-1.5 text-sm"
          placeholder="Filter by exam ID"
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
        />
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
              <th className="px-3 py-2">Submitted</th>
              <th className="px-3 py-2">Answered</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Needs review</th>
              <th className="px-3 py-2">Published</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={7}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={7}>
                  No submissions yet.
                </td>
              </tr>
            )}
            {data?.items.map(({ submission, result }) => (
              <tr key={submission.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{submission.attemptId.slice(0, 8)}…</td>
                <td className="px-3 py-2">
                  {new Date(submission.submittedAt).toLocaleString()}
                  {submission.isAutoSubmitted && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                      auto
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {submission.answeredCount}/{submission.totalQuestions}
                </td>
                <td className="px-3 py-2">{result ? `${result.score} / ${result.maxScore}` : '—'}</td>
                <td className="px-3 py-2">
                  {result?.needsManualReview ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">Yes</span>
                  ) : (
                    'No'
                  )}
                </td>
                <td className="px-3 py-2">{result?.published ? 'Published' : 'Draft'}</td>
                <td className="px-3 py-2">
                  {result && (
                    <div className="flex gap-2">
                      <button
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={busyAttemptId === submission.attemptId}
                        onClick={() => handleScoreEdit(submission.attemptId, result.score)}
                      >
                        Edit score
                      </button>
                      <button
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={busyAttemptId === submission.attemptId}
                        onClick={() => handleTogglePublish(submission.attemptId, result.published)}
                      >
                        {result.published ? 'Unpublish' : 'Publish'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && (
        <p className="mt-3 text-xs text-gray-500">
          Showing {data.items.length} of {data.total} submissions.
        </p>
      )}
    </div>
  );
}
