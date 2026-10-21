/**
 * Owner: Person C (moved from apps/exam-client; reached from the dashboard)
 *
 * /student/exams/:examId — exam details and rules, then Start (or Resume).
 * The server decides everything: registration, publish state, the window,
 * and one attempt per student; this page just reflects it.
 */

import { getMyAttemptForExam, getMyExam, startAttempt } from '@secure-exam/api-client';
import { AttemptStatus, StudentExamState } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, FileQuestion, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { formatDateTime, formatRelative } from '@/lib/format';
import { OpenInExamApp } from '../components/OpenInExamApp';
import { useAttempt } from '../contexts/AttemptContext';
import { isDesktop } from '../desktop/desktop';
import { REQUIRE_DESKTOP_EXAM } from '../desktop/requireDesktop';
import { ReadinessGate } from '../desktop/ReadinessGate';

const INSTRUCTIONS = [
  'Read each question carefully before answering.',
  'Mark questions for review and come back to them from the question palette.',
  'Your answers are saved on this device as you go and sent to the server automatically. If the connection drops, keep working: they sync when it returns.',
  'The timer runs on the server. When it reaches zero your exam is submitted automatically.',
  'Do not refresh or close the window during the exam. If you do, sign in again and resume: your answers are kept.',
  'Activity during the exam is recorded in the audit log.',
];

export default function InstructionsPage() {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const { setAttemptId } = useAttempt();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Always true in a browser; in the exam app, true once the readiness checks pass.
  const [kioskReady, setKioskReady] = useState(false);

  const { data: exam, isPending, error: loadError, refetch } = useQuery({
    queryKey: ['me', 'exams', examId],
    queryFn: () => getMyExam(examId),
    // An upcoming exam flips to live on its own; keep checking.
    refetchInterval: (query) => (query.state.data?.state === StudentExamState.UPCOMING ? 15_000 : false),
  });

  function enter(attemptId: string) {
    setAttemptId(attemptId);
    navigate('/student/exam', { replace: true });
  }

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const attempt = await startAttempt({ examId });
      enter(attempt.id);
    } catch (err) {
      // 409: already started (e.g. in another tab). Resume if it's still running.
      if (getErrorStatus(err) === 409) {
        try {
          const existing = await getMyAttemptForExam(examId);
          if (existing.status === AttemptStatus.IN_PROGRESS) return enter(existing.id);
          setError('You have already submitted this exam.');
          return;
        } catch {
          // fall through to the generic message
        }
      }
      setError(getErrorMessage(err, 'Unable to start the exam. Please contact your invigilator.'));
      void refetch();
    } finally {
      setStarting(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <ErrorState
          message={getErrorStatus(loadError) === 404 ? "This exam isn't available to you." : getErrorMessage(loadError)}
          onRetry={getErrorStatus(loadError) === 404 ? undefined : () => refetch()}
        />
      </Shell>
    );
  }

  if (isPending || !exam) {
    return (
      <Shell>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </Shell>
    );
  }

  const resumable = exam.attemptStatus === AttemptStatus.IN_PROGRESS && exam.attemptId;
  // In a browser the exam is opened in the exam app; the real start happens there.
  const openInApp = REQUIRE_DESKTOP_EXAM && !isDesktop() && (resumable || exam.state === StudentExamState.LIVE);

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{exam.title}</CardTitle>
          {exam.description && <CardDescription className="whitespace-pre-line">{exam.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <Fact icon={Clock} label="Duration" value={`${exam.durationMinutes} minutes`} />
            <Fact icon={FileQuestion} label="Questions" value={String(exam.questionCount)} />
            <Fact icon={CalendarClock} label="Window" value={`${formatDateTime(exam.startTime)} – ${formatDateTime(exam.endTime)}`} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Before you start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <ul className="space-y-2">
            {INSTRUCTIONS.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>

          <ReadinessGate onReady={setKioskReady} />

          {error && <Alert variant="destructive">{error}</Alert>}

          {openInApp ? (
            <OpenInExamApp examId={examId} resuming={!!resumable} />
          ) : resumable ? (
            <Button size="lg" onClick={() => enter(exam.attemptId!)} disabled={!kioskReady}>
              <PlayCircle /> Resume exam
            </Button>
          ) : exam.state === StudentExamState.LIVE ? (
            <>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                I have read the instructions. I understand the timer starts as soon as I begin and cannot be paused.
              </label>
              <Button size="lg" onClick={handleStart} disabled={!agreed || !kioskReady} loading={starting}>
                <PlayCircle /> Start exam
              </Button>
            </>
          ) : exam.state === StudentExamState.UPCOMING ? (
            <Alert variant="info" title={`Opens ${formatRelative(exam.startTime)}`}>
              This page updates by itself when the exam opens.
            </Alert>
          ) : exam.state === StudentExamState.COMPLETED ? (
            <Alert variant="success" title="You have submitted this exam">
              Your result appears on your dashboard once it is published.
            </Alert>
          ) : (
            <Alert variant="warning" title="This exam has closed">
              You did not start it before the window ended. Contact your invigilator if this is wrong.
            </Alert>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Link to="/student/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>
      {children}
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-background p-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}
