// Owner: Person A — student-wise ranking.

import { getExamStudentResults } from '@secure-exam/api-client';
import { StudentAttemptStatus } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime, formatDuration, formatPercent, formatScore } from '@/lib/format';
import { ViolationsButton } from '@/features/monitoring/ViolationsDialog';
import type { ResultsTabProps } from '../tabs.registry';

const STATUS: Record<StudentAttemptStatus, { label: string; variant: BadgeProps['variant'] }> = {
  [StudentAttemptStatus.SUBMITTED]: { label: 'Submitted', variant: 'success' },
  [StudentAttemptStatus.AUTO_SUBMITTED]: { label: 'Auto-submitted', variant: 'warning' },
  [StudentAttemptStatus.IN_PROGRESS]: { label: 'In progress', variant: 'info' },
  [StudentAttemptStatus.NOT_STARTED]: { label: 'Not started', variant: 'secondary' },
};

export function StudentsTab({ examId }: ResultsTabProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | StudentAttemptStatus>('ALL');
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['results', examId, 'students'],
    queryFn: () => getExamStudentResults(examId),
    refetchInterval: 30_000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (r) =>
        (status === 'ALL' || r.status === status) &&
        (!q || r.fullName.toLowerCase().includes(q) || (r.collegeId ?? '').toLowerCase().includes(q) || r.email.toLowerCase().includes(q)),
    );
  }, [data, search, status]);

  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;
  if (isPending) return <TableSkeleton columns={7} />;
  if (data.items.length === 0) {
    return <EmptyState icon={Users} title="No students" description="Nobody is registered for or has attempted this exam." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-8" placeholder="Search students" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-48" aria-label="Filter by status">
          <option value="ALL">All statuses ({data.items.length})</option>
          {Object.entries(STATUS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label} ({data.items.filter((r) => r.status === value).length})
            </option>
          ))}
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 text-right">Rank</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead>Result</TableHead>
            <TableHead className="text-right">Time taken</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="text-right" title="Security violations (desktop client)">
              Violations
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.userId}>
              <TableCell className="text-right font-semibold tabular-nums">{r.rank ?? '—'}</TableCell>
              <TableCell>
                <p className="font-medium">{r.fullName}</p>
                <p className="font-mono text-xs text-muted-foreground">{r.collegeId ?? r.email}</p>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.score === null ? '—' : `${formatScore(r.score)} / ${formatScore(r.maxScore)}`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatPercent(r.percentage)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {r.passed === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : r.passed ? (
                    <Badge variant="success">Pass</Badge>
                  ) : (
                    <Badge variant="destructive">Fail</Badge>
                  )}
                  {r.needsManualReview && <Badge variant="warning">Needs review</Badge>}
                  {r.resultPublished && <Badge variant="outline">Published</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatDuration(r.timeTakenSeconds)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(r.submittedAt)}</TableCell>
              <TableCell className="text-right">
                <ViolationsButton attemptId={r.attemptId} count={r.violationCount ?? null} studentName={r.fullName} />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                No students match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
