// Owner: Person A

import { getExams } from '@secure-exam/api-client';
import { ExamStatus, Permission } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccess } from '@/auth/useAccess';
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
  const { can, courses } = useAccess();
  const canCreate = can(Permission.EXAM_EDIT);
  const courseCode = (id: string | null) => courses.find((c) => c.courseId === id)?.code ?? '—';

  return (
    <>
      <PageHeader
        title="Exams"
        description="Exams of the courses you teach or assist on."
        actions={
          canCreate && (
            <Button asChild>
              <Link to="/instructor/exams/new">
                <Plus /> New exam
              </Link>
            </Button>
          )
        }
      />
      {error ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={6} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No exams yet"
          description={
            canCreate
              ? 'Create a draft in one of your courses, add questions, and publish it.'
              : 'Exams appear here once you teach or assist on a course that has some.'
          }
          action={
            canCreate && (
              <Button asChild>
                <Link to="/instructor/exams/new">Create an exam</Link>
              </Button>
            )
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
                <TableHead>Course</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opens</TableHead>
                <TableHead>Closes</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((exam) => (
                <TableRow key={exam.id} className="cursor-pointer" onClick={() => navigate(`/instructor/exams/${exam.id}`)}>
                  <TableCell>
                    <Link to={`/instructor/exams/${exam.id}`} className="font-medium hover:underline">
                      {exam.title}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{courseCode(exam.courseId)}</TableCell>
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
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
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
