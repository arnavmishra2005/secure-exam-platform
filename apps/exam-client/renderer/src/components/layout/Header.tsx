/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Exam header bar — shown on /instructions, /exam, and /submitted.
 * Contains:
 *   - Exam title (from AttemptContext)
 *   - TimerDisplay (server-seeded countdown)
 *   - NetworkStatusBadge (renders Person C's useNetworkStatus output)
 *   - Student name (from AuthContext)
 */

import { useAttempt } from '../../hooks/useAttempt';
import { useAuth } from '../../hooks/useAuth';
import { TimerDisplay } from '../timer/TimerDisplay';
import { NetworkStatusBadge } from '../common/NetworkStatusBadge';

interface HeaderProps {
  /** Called when the countdown reaches 0 so ExamPage can trigger auto-submit UI. */
  onTimerExpired?: () => void;
  /** Optional handler to trigger exam completion / submission modal */
  onFinish?: () => void;
}

export function Header({ onTimerExpired, onFinish }: HeaderProps) {
  const { user } = useAuth();
  const { expiresAt, exam, attempt } = useAttempt();

  const examTitle = exam?.title ?? (attempt ? 'Exam in Progress' : 'Secure Exam');

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
      {/* Left: exam title */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-semibold text-gray-800 truncate max-w-xs" title={examTitle}>
          {examTitle}
        </span>
        <NetworkStatusBadge />
      </div>

      {/* Center: timer */}
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 leading-none mb-0.5">
          Time Left
        </span>
        <TimerDisplay expiresAt={expiresAt} onExpired={onTimerExpired} className="text-lg" />
      </div>

      {/* Right: student info & finish button */}
      <div className="flex items-center gap-3 text-sm text-gray-600 min-w-0 justify-end">
        {onFinish && (
          <button
            type="button"
            onClick={onFinish}
            className="px-3.5 py-1.5 text-xs font-semibold rounded bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
          >
            Finish Exam
          </button>
        )}
        <span className="hidden sm:inline truncate max-w-[160px]" title={user?.fullName}>
          {user?.fullName ?? user?.email ?? ''}
        </span>
        <span className="inline-block w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center uppercase select-none flex-shrink-0">
          {(user?.fullName ?? user?.email ?? '?')[0]}
        </span>
      </div>
    </header>
  );
}

