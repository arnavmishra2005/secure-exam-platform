/**
 * Owner: Person C — live attempts, heartbeat health, and time extension.
 * Polls GET /attempts every 10 s; time left ticks locally between polls.
 */

import { getExams, listAttempts } from '@secure-exam/api-client';
import { AttemptStatus, ExamStatus } from '@secure-exam/types';
import type { AttemptMonitorView } from '@secure-exam/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw, TimerReset, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getErrorMessage } from '@/lib/errors';
import { formatDuration, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ExtendTimeDialog, type ExtendTarget } from './ExtendTimeDialog';
import { ViolationsButton } from './ViolationsDialog';

const POLL_MS = 10_000;

export default function MonitoringPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const examId = searchParams.get('examId') ?? '';
  const status = (searchParams.get('status') ?? '') as AttemptStatus | '';
  const [target, setTarget] = useState<ExtendTarget | null>(null);
  const now = useNow(1000);

  const exams = useQuery({ queryKey: ['exams'], queryFn: getExams });
  const attempts = useQuery({
    queryKey: ['attempts', { examId, status }],
    queryFn: () => listAttempts({ examId: examId || undefined, status: status || undefined, limit: 100 }),
    refetchInterval: POLL_MS,
  });

  const runningExams = (exams.data ?? []).filter((e) => e.status === ExamStatus.ACTIVE || e.status === ExamStatus.SCHEDULED);
  const selectedExam = (exams.data ?? []).find((e) => e.id === examId);
  const items = attempts.data?.items ?? [];
  // Local tick between polls, anchored to when the data arrived.
  const fetchedAt = attempts.dataUpdatedAt || now;

  const counts = useMemo(() => {
    const live = items.filter((a) => a.status === AttemptStatus.IN_PROGRESS && !a.isOverdue);
    return {
      live: live.length,
      disconnected: live.filter((a) => a.isDisconnected).length,
      finished: items.filter((a) => a.status !== AttemptStatus.IN_PROGRESS).length,
    };
  }, [items]);

  function setFilter(key: 'examId' | 'status', value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Live monitoring"
        description={`Attempts refresh every ${POLL_MS / 1000} s. A student is shown disconnected when their exam client stops sending heartbeats.`}
        actions={
          <>
            <Button variant="outline" onClick={() => attempts.refetch()} loading={attempts.isFetching && !attempts.isPending}>
              <RefreshCw /> Refresh
            </Button>
            <Button
              onClick={() => selectedExam && setTarget({ examId: selectedExam.id, examTitle: selectedExam.title })}
              disabled={!selectedExam || !(selectedExam.status === ExamStatus.ACTIVE || selectedExam.status === ExamStatus.SCHEDULED)}
              title={selectedExam ? undefined : 'Pick an exam first'}
            >
              <TimerReset /> Extend exam
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={examId} onChange={(e) => setFilter('examId', e.target.value)} className="w-72" aria-label="Exam">
          <option value="">All exams</option>
          {runningExams.length > 0 && (
            <optgroup label="Open or scheduled">
              {runningExams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Other">
            {(exams.data ?? [])
              .filter((e) => !runningExams.includes(e))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
          </optgroup>
        </Select>
        <Select value={status} onChange={(e) => setFilter('status', e.target.value)} className="w-48" aria-label="Status">
          <option value="">All statuses</option>
          <option value={AttemptStatus.IN_PROGRESS}>In progress</option>
          <option value={AttemptStatus.SUBMITTED}>Submitted</option>
          <option value={AttemptStatus.AUTO_SUBMITTED}>Auto-submitted</option>
        </Select>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="In progress" value={counts.live} />
        <StatCard
          label="Disconnected"
          value={<span className={cn(counts.disconnected > 0 && 'text-destructive')}>{counts.disconnected}</span>}
          hint="No heartbeat recently"
        />
        <StatCard label="Finished" value={counts.finished} />
      </div>

      {attempts.error ? (
        <ErrorState message={getErrorMessage(attempts.error)} onRetry={() => attempts.refetch()} />
      ) : attempts.isPending ? (
        <TableSkeleton columns={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={Activity} title="No attempts" description="Attempts appear here as soon as students start." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              {!examId && <TableHead>Exam</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Time left</TableHead>
              <TableHead>Last heartbeat</TableHead>
              <TableHead className="text-right" title="Security violations (desktop client)">
                Violations
              </TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => (
              <AttemptRow
                key={a.id}
                attempt={a}
                showExam={!examId}
                elapsedSinceFetch={Math.max(0, Math.floor((now - fetchedAt) / 1000))}
                now={now}
                onExtend={() =>
                  setTarget({
                    examId: a.examId,
                    examTitle: a.examTitle ?? 'this exam',
                    student: { id: a.studentId, name: a.studentName ?? 'this student' },
                  })
                }
              />
            ))}
          </TableBody>
        </Table>
      )}
      {attempts.data && attempts.data.total > items.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing the {items.length} most recent of {attempts.data.total} attempts. Filter by exam to narrow it down.
        </p>
      )}

      <ExtendTimeDialog
        target={target}
        onOpenChange={(open) => !open && setTarget(null)}
        onExtended={() => {
          void queryClient.invalidateQueries({ queryKey: ['attempts'] });
          void queryClient.invalidateQueries({ queryKey: ['exams'] });
        }}
      />
    </>
  );
}

function AttemptRow({
  attempt: a,
  showExam,
  elapsedSinceFetch,
  now,
  onExtend,
}: {
  attempt: AttemptMonitorView;
  showExam: boolean;
  elapsedSinceFetch: number;
  now: number;
  onExtend: () => void;
}) {
  const running = a.status === AttemptStatus.IN_PROGRESS;
  const remaining = running ? Math.max(0, a.remainingSeconds - elapsedSinceFetch) : null;

  return (
    <TableRow className={cn(running && a.isDisconnected && 'bg-destructive/5')}>
      <TableCell>
        <p className="font-medium">{a.studentName ?? 'Unknown student'}</p>
        <p className="font-mono text-xs text-muted-foreground">{a.collegeId ?? a.studentId.slice(0, 8)}</p>
      </TableCell>
      {showExam && <TableCell className="max-w-[220px] truncate">{a.examTitle ?? a.examId.slice(0, 8)}</TableCell>}
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <StatusBadge attempt={a} />
          {running && a.isDisconnected && !a.isOverdue && (
            <Badge variant="destructive">
              <WifiOff className="h-3 w-3" /> Disconnected
            </Badge>
          )}
          {a.isFlagged && <Badge variant="destructive">Flagged</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {remaining === null ? '—' : remaining === 0 ? 'Time up' : formatDuration(remaining)}
        {!!a.extendedMinutes && <p className="text-xs text-muted-foreground">+{a.extendedMinutes} min extended</p>}
      </TableCell>
      <TableCell className="text-muted-foreground">{a.lastSeenAt ? formatRelative(a.lastSeenAt, now) : 'Never'}</TableCell>
      <TableCell className="text-right">
        <ViolationsButton attemptId={a.id} count={a.violationCount ?? null} studentName={a.studentName} />
      </TableCell>
      <TableCell className="text-right">
        {running && (
          <Button variant="outline" size="sm" onClick={onExtend}>
            <TimerReset /> Extend
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ attempt }: { attempt: AttemptMonitorView }) {
  if (attempt.isOverdue) return <Badge variant="warning">Closing out…</Badge>;
  switch (attempt.status) {
    case AttemptStatus.IN_PROGRESS:
      return <Badge variant="success">In progress</Badge>;
    case AttemptStatus.SUBMITTED:
      return <Badge variant="info">Submitted</Badge>;
    case AttemptStatus.AUTO_SUBMITTED:
      return <Badge variant="warning">Auto-submitted</Badge>;
    default:
      return <Badge variant="outline">{attempt.status}</Badge>;
  }
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
