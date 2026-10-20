/**
 * Owner: Person C — the student's home: live, upcoming and finished exams,
 * published results, and notifications, from one GET /me/dashboard call.
 */

import { getMyDashboard, markAllNotificationsRead, markNotificationRead } from '@secure-exam/api-client';
import { AttemptStatus, StudentExamState } from '@secure-exam/types';
import type { DashboardResultItem, StudentExamView } from '@secure-exam/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Award, Bell, CalendarClock, CheckCircle2, Clock, PlayCircle, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationList, notificationsQueryKey } from '@/features/notifications/NotificationBell';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime, formatPercent, formatRelative, formatScore } from '@/lib/format';

export default function StudentDashboardPage() {
  const queryClient = useQueryClient();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getMyDashboard,
    // Upcoming exams go live on their own; results and notifications arrive any time.
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
  };
  const markOne = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });

  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;
  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  const firstName = data.student.fullName.split(' ')[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Hello, {firstName}</h1>
        <p className="text-sm text-muted-foreground">
          {data.student.collegeId && <span className="font-mono">{data.student.collegeId}</span>}
          {data.student.collegeId && ' · '}
          {data.live.length
            ? `${data.live.length} exam${data.live.length > 1 ? 's are' : ' is'} open now.`
            : data.upcoming.length
              ? `Next exam ${formatRelative(data.upcoming[0].startTime)}.`
              : 'No exams scheduled.'}
        </p>
      </div>

      {data.live.length > 0 && (
        <section aria-labelledby="live-heading" className="space-y-3">
          <h2 id="live-heading" className="flex items-center gap-2 font-serif text-lg font-semibold">
            <Radio className="h-4 w-4 text-success" aria-hidden="true" /> Open now
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.live.map((exam) => (
              <LiveExamCard key={exam.examId} exam={exam} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Upcoming
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scheduled. Published exams you're registered for appear here.</p>
              ) : (
                <ul className="divide-y">
                  {data.upcoming.map((exam) => (
                    <li key={exam.examId} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Link to={`/student/exams/${exam.examId}`} className="font-medium hover:underline">
                          {exam.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(exam.startTime)} · {exam.durationMinutes} min · {exam.questionCount} questions
                        </p>
                      </div>
                      <Badge variant="info">Opens {formatRelative(exam.startTime)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No results published yet.</p>
              ) : (
                <ul className="divide-y">
                  {data.results.map((r) => (
                    <ResultRow key={r.attemptId} result={r} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.completed.length === 0 ? (
                <p className="text-sm text-muted-foreground">Exams you finish appear here.</p>
              ) : (
                <ul className="divide-y">
                  {data.completed.map((exam) => (
                    <li key={exam.examId} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{exam.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(exam.startTime)}</p>
                      </div>
                      {exam.state === StudentExamState.MISSED ? (
                        <Badge variant="secondary">Missed</Badge>
                      ) : exam.attemptStatus === AttemptStatus.AUTO_SUBMITTED ? (
                        <Badge variant="warning">Auto-submitted</Badge>
                      ) : (
                        <Badge variant="success">Submitted</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Notifications
              {data.notifications.unreadCount > 0 && <Badge variant="default">{data.notifications.unreadCount}</Badge>}
            </CardTitle>
            {data.notifications.unreadCount > 0 && (
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => markAll.mutate()}>
                Mark all read
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {data.notifications.latest.length === 0 ? (
              <EmptyState icon={Bell} title="No notifications" className="mx-5 mb-3 border-0 py-6" />
            ) : (
              <NotificationList items={data.notifications.latest} onRead={(id) => markOne.mutate(id)} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LiveExamCard({ exam }: { exam: StudentExamView }) {
  const resuming = exam.attemptStatus === AttemptStatus.IN_PROGRESS;
  return (
    <Card className="border-success/40">
      <CardContent className="flex h-full flex-col justify-between gap-4 pt-5">
        <div>
          <p className="font-serif text-lg font-semibold">{exam.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {exam.durationMinutes} min
            </span>
            <span>{exam.questionCount} questions</span>
            <span>Closes {formatDateTime(exam.endTime)}</span>
          </p>
        </div>
        <Button asChild className="self-start">
          <Link to={`/student/exams/${exam.examId}`}>
            {resuming ? <PlayCircle /> : <ArrowRight />} {resuming ? 'Resume exam' : 'Start exam'}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ResultRow({ result: r }: { result: DashboardResultItem }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">{r.title}</p>
        <p className="text-xs text-muted-foreground">Published {formatDateTime(r.publishedAt)}</p>
      </div>
      <div className="flex items-center gap-3 text-right">
        <div>
          <p className="font-semibold tabular-nums">
            {formatScore(r.score)} / {formatScore(r.maxScore)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">{formatPercent(r.percentage)}</p>
        </div>
        {r.passed ? <Badge variant="success">Pass</Badge> : <Badge variant="destructive">Fail</Badge>}
      </div>
    </li>
  );
}
