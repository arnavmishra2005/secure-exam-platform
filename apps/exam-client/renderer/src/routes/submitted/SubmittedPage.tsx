/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Submitted page — shown after successful submission.
 * Displays a confirmation message and optionally the result if
 * the admin has published it (via Phase 1's Result.isPublished flag).
 *
 * This page is intentionally minimal for Phase 2/3; result display
 * can be enriched once Phase 1's result publishing flow is complete.
 */

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAttempt } from '../../contexts/AttemptContext';
import { useSyncStatus } from '../../hooks/useSyncStatus';

export default function SubmittedPage() {
  const { user, logout } = useAuth();
  const { setAttemptId } = useAttempt();
  const navigate = useNavigate();
  // Person C's queued submission (e.g. the timer ran out while offline).
  const submit = useSyncStatus((s) => s.submit);
  const isPending = submit === 'pending';

  async function handleLogout() {
    // Clear the attempt reference — exam is done.
    setAttemptId(null);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Success illustration */}
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isPending ? 'Submission Pending' : 'Exam Submitted'}
        </h1>
        <p className="text-gray-500 text-sm mb-1">
          {isPending
            ? 'Your submission is saved on this device and will be sent when the connection returns.'
            : 'Your answers have been submitted successfully.'}
        </p>
        <p className="text-gray-400 text-xs mb-8">
          Submitted as <strong>{user?.fullName ?? user?.email}</strong>
        </p>

        {isPending ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800 mb-8" role="status">
            Reconnect to finish. Do not close this window until this page says your exam is submitted.
          </div>
        ) : submit === 'failed' ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700 mb-8" role="alert">
            The server could not confirm your submission. Please contact your invigilator.
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-700 mb-8">
            Results will be published by your institution. You will be notified when they are available.
          </div>
        )}

        <button
          onClick={handleLogout}
          disabled={isPending}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

