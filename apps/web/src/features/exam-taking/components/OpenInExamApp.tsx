// Owner: Person C (Electron, Kiosk & Security)
// Shown in a normal browser where an exam would start. The dashboard, results and
// the admin portal work in the browser; the exam itself is sat in the exam app.
//
// "Start" asks the API for a one-time launch token and opens the app with it
// (secure-exam://launch/<token>). The app signs the student in with that token, so
// the password is never sent to it.

import { createExamLaunch } from '@secure-exam/api-client';
import { MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/errors';
import { examAppLink } from '../desktop/requireDesktop';

export function OpenInExamApp({ examId, resuming }: { examId: string; resuming: boolean }) {
  const [agreed, setAgreed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setOpening(true);
    setError(null);
    try {
      const { token } = await createExamLaunch(examId);
      const url = examAppLink(token);
      setLink(url);
      window.location.href = url;
    } catch (err) {
      setError(getErrorMessage(err, 'Could not prepare the exam app. Please try again.'));
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="space-y-4">
      <Alert variant="info" title="This exam is taken in the Secure Exam app">
        The exam app locks your computer to the exam and records your activity. When you press the button below it opens and
        signs you in automatically; you only click <strong>Login</strong>. {resuming ? 'You will continue where you left off.' : ''}
      </Alert>
      {error && <Alert variant="destructive">{error}</Alert>}

      {!resuming && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          I have read the instructions. I understand the timer starts as soon as I begin and cannot be paused.
        </label>
      )}

      <Button size="lg" onClick={() => void open()} loading={opening} disabled={!resuming && !agreed}>
        <MonitorSmartphone /> {resuming ? 'Resume in exam app' : 'Start exam in exam app'}
      </Button>

      {link && (
        <p className="text-xs text-muted-foreground">
          The exam app should be opening. If nothing happens, it may not be installed on this computer: ask your invigilator.
          The link works once and expires in a couple of minutes.
        </p>
      )}
      {link && import.meta.env.DEV && (
        <p className="break-all rounded border bg-muted/40 p-2 font-mono text-[11px]">
          Development: macOS does not hand links to an unpackaged app. Start it with
          <br />
          EXAM_LAUNCH_LINK=&quot;{link}&quot; npm run client:desktop
        </p>
      )}
    </div>
  );
}
