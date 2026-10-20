// Owner: Person A

import { getExams } from '@secure-exam/api-client';
import { ExamStatus } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { ExamStatusBadge, PublishedBadge } from './ExamStatusBadge';

const FILTERS = ['ALL', ExamStatus.DRAFT, ExamStatus.SCHEDULED, ExamStatus.ACTIVE, ExamStatus.CLOSED] as const;

export default function ExamsListPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['exams'], queryFn: getExams });
  const exams = (data ?? []).filter((e) => filter === 'ALL' || e.status === filter);

  return (
    <>
      <PageHeader
        title="Exams"
        actions={
          <Button asChild>
            <Link to="/admin/exams/new">
              <Plus /> New exam
            </Link>
          </Button>
        }
      />
      {error ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={5} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No exams yet"
          description="Create a draft, add questions, register students and publish it."
          action={
            <Button asChild>
              <Link to="/admin/exams/new">Create an exam</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f} value={f}>
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                  <span className="text-xs text-muted-foreground">
                    {f === 'ALL' ? data.length : data.filter((e) => e.status === f).length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opens</TableHead>
                <TableHead>Closes</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((exam) => (
                <TableRow key={exam.id} className="cursor-pointer" onClick={() => navigate(`/admin/exams/${exam.id}`)}>
                  <TableCell>
                    <Link to={`/admin/exams/${exam.id}`} className="font-medium hover:underline">
                      {exam.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <ExamStatusBadge status={exam.status} />
                      {exam.status !== ExamStatus.DRAFT && <PublishedBadge exam={exam} />}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(exam.startTime)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(exam.endTime)}</TableCell>
                  <TableCell className="text-right tabular-nums">{exam.durationMinutes} min</TableCell>
                </TableRow>
              ))}
              {exams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No exams with this status.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
