/**
 * Owner: Person C — "Time extensions" tab on the admin exam page.
 */

import { listExamExtensions, listExamRegistrations } from '@secure-exam/api-client';
import { ExamStatus, ExtensionScope } from '@secure-exam/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, TimerReset } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ExamTabProps } from '@/features/exams/examTabs.registry';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { ExtendTimeDialog, type ExtendTarget } from './ExtendTimeDialog';

export function ExtensionsTab({ exam, onChanged }: ExamTabProps) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ExtendTarget | null>(null);
  const extensions = useQuery({ queryKey: ['exams', exam.id, 'extensions'], queryFn: () => listExamExtensions(exam.id) });
  // For showing names next to per-student extensions.
  const registrations = useQuery({ queryKey: ['exams', exam.id, 'registrations'], queryFn: () => listExamRegistrations(exam.id) });
  const nameByUser = new Map((registrations.data ?? []).map((r) => [r.student.userId, `${r.student.fullName} (${r.student.collegeId})`]));
  const extendable = exam.status === ExamStatus.SCHEDULED || exam.status === ExamStatus.ACTIVE;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          To extend one student, use{' '}
          <Link to={`/admin/monitoring?examId=${exam.id}`} className="text-primary hover:underline">
            live monitoring
          </Link>
          .
        </p>
        <Button onClick={() => setTarget({ examId: exam.id, examTitle: exam.title })} disabled={!extendable}>
          <TimerReset /> Extend for everyone
        </Button>
      </div>

      {extensions.error ? (
        <ErrorState message={getErrorMessage(extensions.error)} onRetry={() => extensions.refetch()} />
      ) : extensions.isPending ? (
        <TableSkeleton columns={5} rows={3} />
      ) : extensions.data.length === 0 ? (
        <EmptyState icon={Clock} title="No extensions" description="Extra time granted to this exam or its students is listed here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Granted</TableHead>
              <TableHead>Who</TableHead>
              <TableHead className="text-right">Minutes</TableHead>
              <TableHead className="text-right">Running attempts updated</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {extensions.data.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                <TableCell>
                  {e.scope === ExtensionScope.ALL ? (
                    <Badge variant="info">Everyone</Badge>
                  ) : (
                    nameByUser.get(e.studentId ?? '') ?? <span className="font-mono text-xs">{e.studentId}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">+{e.minutes}</TableCell>
                <TableCell className="text-right tabular-nums">{e.affectedAttempts}</TableCell>
                <TableCell className="text-muted-foreground">{e.reason ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ExtendTimeDialog
        target={target}
        onOpenChange={(open) => !open && setTarget(null)}
        onExtended={() => {
          void queryClient.invalidateQueries({ queryKey: ['exams', exam.id, 'extensions'] });
          void queryClient.invalidateQueries({ queryKey: ['attempts'] });
          onChanged();
        }}
      />
    </div>
  );
}
