/**
 * Owner: Person C (Electron, Kiosk & Security)
 *
 * What the exam app shows when the exam is over, like Safe Exam Browser: the answers
 * are on the server, the results come later in the browser, and the only thing left
 * to do is close the app. There is no dashboard, no sign-out, nothing to click into.
 * The app closes by itself after AUTO_CLOSE_SECONDS.
 */

import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAttempt } from '../contexts/AttemptContext';
import { desktop } from '../desktop/desktop';
import { useSyncStatus } from '../hooks/useSyncStatus';

export const AUTO_CLOSE_SECONDS = 30;

export function ExamAppSubmitted() {
  const { setAttemptId } = useAttempt();
  // Person C's queued submission (e.g. the timer ran out while offline).
  const submit = useSyncStatus((s) => s.submit);
  const pending = submit === 'pending';
  const failed = submit === 'failed';
  const confirmed = !pending && !failed;
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CLOSE_SECONDS);

  // The server has the answers: end the lockdown and forget the attempt.
  useEffect(() => {
    if (!confirmed) return;
    desktop.notifySubmitted();
    setAttemptId(null);
  }, [confirmed, setAttemptId]);

  useEffect(() => {
    if (!confirmed) return;
    const timer = setInterval(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearInterval(timer);
  }, [confirmed]);

  useEffect(() => {
    if (confirmed && secondsLeft <= 0) void desktop.exitKiosk();
  }, [confirmed, secondsLeft]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
        </div>

        {pending ? (
          <>
            <h1 className="font-serif text-2xl font-semibold">Submission pending</h1>
            <p className="text-sm text-muted-foreground">
              Your answers are saved on this computer and will be sent as soon as the connection returns.
            </p>
            <Alert variant="warning" title="Do not close this app yet">
              Reconnect to the network to finish.
            </Alert>
          </>
        ) : failed ? (
          <>
            <h1 className="font-serif text-2xl font-semibold">Submission not confirmed</h1>
            <Alert variant="destructive" title="The server could not confirm your submission">
              Please contact your invigilator. Do not close this app.
            </Alert>
          </>
        ) : (
          <>
            <h1 className="font-serif text-2xl font-semibold">Exam submitted</h1>
            <p className="text-sm text-muted-foreground">Your answers have been submitted to the server.</p>
            <div className="rounded-xl border bg-card px-5 py-4 text-sm text-card-foreground">
              Your instructor will publish the results. You can check them in your browser once they are published.
            </div>
            <p className="text-sm font-medium">You can close this app now.</p>
            <Button size="lg" className="w-full" onClick={() => void desktop.exitKiosk()}>
              Close app
            </Button>
            <p className="text-xs text-muted-foreground" role="status">
              This app closes automatically in {Math.max(secondsLeft, 0)} seconds.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
