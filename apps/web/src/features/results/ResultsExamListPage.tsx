// Owner: Person A — results start from the exam list.

import { listResultExams } from '@secure-exam/api-client';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExamStatusBadge } from '@/features/exams/ExamStatusBadge';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime, formatPercent } from '@/lib/format';

export default function ResultsExamListPage() {
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['results', 'exams'], queryFn: listResultExams });

  return (
    <>
      <PageHeader title="Results" description="Pick an exam to see its overview, student ranking and question analysis." />
      {error ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={6} />
      ) : data.length === 0 ? (
        <EmptyState icon={BarChart3} title="No exams yet" description="Results appear here once students submit." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Exam</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead className="text-right">Submitted</TableHead>
              <TableHead className="text-right">Average</TableHead>
              <TableHead className="text-right">Pass rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((exam) => (
              <TableRow key={exam.examId} className="cursor-pointer" onClick={() => navigate(`/admin/results/${exam.examId}`)}>
                <TableCell>
                  <Link to={`/admin/results/${exam.examId}`} className="font-medium hover:underline">
                    {exam.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <ExamStatusBadge status={exam.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(exam.startTime)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {exam.submittedCount} / {exam.registeredCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPercent(exam.averagePercentage)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPercent(exam.passRate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
