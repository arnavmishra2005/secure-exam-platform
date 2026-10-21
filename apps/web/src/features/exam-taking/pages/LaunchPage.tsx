/**
 * Owner: Person C (Electron, Kiosk & Security)
 *
 * /launch : the only front door of the exam app, like Safe Exam Browser.
 *
 * The student signed in on the browser and pressed "Start exam". The browser got a
 * one-time launch token and opened this app with it. Here the student sees their own
 * email and a masked password (both read-only, nothing to type or change) and clicks
 * Login. The password itself never reaches this app: Login swaps the one-time token
 * for a normal session, then goes straight into the exam.
 */

import { previewExamLaunch, redeemExamLaunch } from '@secure-exam/api-client';
import type { ExamLaunchPreview } from '@secure-exam/types';
import { GraduationCap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { clearTokens } from '@/auth/session';
import { useAuth } from '@/auth/AuthContext';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { ATTEMPT_ID_KEY, useAttempt } from '../contexts/AttemptContext';
import { desktop, isDesktop } from '../desktop/desktop';
import { ReadinessGate } from '../desktop/ReadinessGate';
import { AttemptUnavailableError, startOrResumeAttempt } from '../lib/startOrResumeAttempt';

type Phase =
  | { name: 'loading' }
  | { name: 'ready'; preview: ExamLaunchPreview; token: string }
  | { name: 'signing-in' }
  | { name: 'blocked'; title: string; message: string };

const NO_LINK = {
  title: 'Open your exam from the browser',
  message: 'Sign in on the website, open your exam and choose “Start exam”. This app opens on the exam by itself.',
};
const EXPIRED = {
  title: 'This launch link has expired',
  message: 'Go back to your browser and start the exam again. A link works once and only for a couple of minutes.',
};

function examIsRunning(): boolean {
  try {
    return sessionStorage.getItem(ATTEMPT_ID_KEY) !== null;
  } catch {
    return false;
  }
}

export default function LaunchPage() {
  const { signInWithSession } = useAuth();
  const { setAttemptId } = useAttempt();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    void (async () => {
      const token = await window.desktop?.getLaunchToken?.();
      if (cancelled) return;
      if (!token) {
        // Opened without a link: nothing from an earlier run is kept. (Not when an exam is running:
        // a stray redirect to this screen must not sign the student out.)
        if (!examIsRunning()) clearTokens();
        return setPhase({ name: 'blocked', ...NO_LINK });
      }
      try {
        const preview = await previewExamLaunch(token);
        if (!cancelled) setPhase({ name: 'ready', preview, token });
      } catch (err) {
        if (cancelled) return;
        setPhase(
          getErrorStatus(err) === 410
            ? { name: 'blocked', ...EXPIRED }
            : { name: 'blocked', title: 'Could not open the exam', message: getErrorMessage(err, 'Cannot reach the exam server.') },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = useCallback(async () => {
    if (phase.name !== 'ready') return;
    const { token } = phase;
    setPhase({ name: 'signing-in' });
    try {
      const session = await redeemExamLaunch(token);
      window.desktop?.clearLaunchToken?.(); // used up: forget it
      signInWithSession(session);
      try {
        setAttemptId(await startOrResumeAttempt(session.examId));
        navigate('/student/exam', { replace: true });
      } catch (err) {
        // The token is already spent, so there is nothing to retry here.
        setPhase({
          name: 'blocked',
          title: 'Could not start the exam',
          message: err instanceof AttemptUnavailableError ? err.message : getErrorMessage(err),
        });
      }
    } catch (err) {
      setPhase(
        getErrorStatus(err) === 410
          ? { name: 'blocked', ...EXPIRED }
          : { name: 'blocked', title: 'Could not sign in', message: getErrorMessage(err, 'Sign-in failed. Start the exam again from your browser.') },
      );
    }
  }, [phase, signInWithSession, setAttemptId, navigate]);

  // This screen only exists inside the exam app.
  if (!isDesktop()) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" />
          <span className="font-serif text-xl">Secure Exam</span>
        </div>

        {phase.name === 'loading' && <p className="text-sm text-muted-foreground">Checking your launch link…</p>}

        {(phase.name === 'ready' || phase.name === 'signing-in') && (
          <>
            <h1 className="font-serif text-2xl font-semibold">Sign in to start your exam</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {phase.name === 'ready' ? `You are signing in as ${phase.preview.fullName}.` : 'Signing in…'}
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleLogin();
              }}
            >
              <Field label="Email">
                <Input type="email" readOnly value={phase.name === 'ready' ? phase.preview.email : ''} />
              </Field>
              <Field label="Password" hint="Already filled in from your browser sign-in. It cannot be changed here.">
                <Input type="password" readOnly value="••••••••••" />
              </Field>
              <ReadinessGate onReady={setReady} />
              <Button type="submit" size="lg" className="w-full" loading={phase.name === 'signing-in'} disabled={!ready}>
                Login
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => void desktop.exitKiosk()}>
                Cancel and close
              </Button>
            </form>
            <p className="mt-6 text-xs text-muted-foreground">
              Your exam starts as soon as you sign in. This computer is locked to the exam until you submit.
            </p>
          </>
        )}

        {phase.name === 'blocked' && (
          <div className="space-y-4">
            <Alert variant="warning" title={phase.title}>
              {phase.message}
            </Alert>
            <Button variant="outline" className="w-full" onClick={() => void desktop.exitKiosk()}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
