/**
 * Owner: Person C (moved from apps/exam-client; kit-styled)
 *
 * Exam header: title, network status, server-synced countdown, student, finish.
 */

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { useAttempt } from '../contexts/AttemptContext';
import { NetworkStatusBadge } from './NetworkStatusBadge';
import { TimerDisplay } from './TimerDisplay';

interface HeaderProps {
  /** Called when the countdown reaches 0 so ExamPage can trigger auto-submit UI. */
  onTimerExpired?: () => void;
  /** Opens the submit confirmation. */
  onFinish?: () => void;
}

export function Header({ onTimerExpired, onFinish }: HeaderProps) {
  const { user } = useAuth();
  const { expiresAt, serverOffsetMs, exam, attempt } = useAttempt();
  const examTitle = exam?.title ?? (attempt ? 'Exam in progress' : 'Secure Exam');

  return (
    <header className="sticky top-0 z-40 border-b bg-card shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate font-serif text-base font-semibold" title={examTitle}>
            {examTitle}
          </span>
          <NetworkStatusBadge />
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase leading-none tracking-wider text-muted-foreground">Time left</span>
          <TimerDisplay expiresAt={expiresAt} serverOffsetMs={serverOffsetMs} onExpired={onTimerExpired} className="text-lg" />
        </div>

        <div className="flex min-w-0 items-center justify-end gap-3 text-sm">
          <span className="hidden max-w-[160px] truncate text-muted-foreground sm:inline" title={user?.fullName}>
            {user?.fullName}
          </span>
          {onFinish && (
            <Button size="sm" variant="destructive" onClick={onFinish}>
              Finish exam
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
