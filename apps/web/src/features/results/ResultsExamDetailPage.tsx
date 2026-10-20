// Owner: Person A — tab host for one exam's results.

import { getExam, publishExamResults, recomputeExamResults } from '@secure-exam/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { ExamStatusBadge } from '@/features/exams/ExamStatusBadge';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { resultsTabs } from './tabs.registry';

export default function ResultsExamDetailPage() {
  const { examId = '' } = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirm, setConfirm] = useState<'publish' | 'recompute' | null>(null);
  const exam = useQuery({ queryKey: ['exams', examId], queryFn: () => getExam(examId) });
  const tab = searchParams.get('tab') ?? resultsTabs[0].id;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['results'] });

  if (exam.error) return <ErrorState message={getErrorMessage(exam.error)} onRetry={() => exam.refetch()} />;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/admin/results" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Results
          </Link>
        }
        title={exam.data?.title ?? <Skeleton className="h-8 w-72" />}
        description={
          exam.data && (
            <span className="flex flex-wrap items-center gap-2">
              <ExamStatusBadge status={exam.data.status} />
              {formatDateTime(exam.data.startTime)} – {formatDateTime(exam.data.endTime)} · pass mark {exam.data.passPercentage}%
            </span>
          )
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirm('recompute')}>
              <RefreshCw /> Re-grade
            </Button>
            <Button onClick={() => setConfirm('publish')}>
              <Send /> Publish results
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(next) => setSearchParams({ tab: next }, { replace: true })}>
        <TabsList>
          {resultsTabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {resultsTabs.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <t.component examId={examId} />
          </TabsContent>
        ))}
      </Tabs>

      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Publish results to students?"
        description="Every submitted attempt's score becomes visible on that student's dashboard, and they are notified. Results already published are left as they are."
        confirmLabel="Publish results"
        onConfirm={async () => {
          try {
            const { publishedCount } = await publishExamResults(examId);
            toast.success(publishedCount ? `Published ${publishedCount} result(s)` : 'Nothing new to publish');
            refresh();
          } catch (err) {
            toast.error(getErrorMessage(err));
          }
        }}
      />
      <ConfirmDialog
        open={confirm === 'recompute'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Re-grade objective questions?"
        description="Recalculates every submitted attempt from the current answer key, e.g. after correcting a question. Manual score overrides on those attempts are replaced."
        confirmLabel="Re-grade"
        onConfirm={async () => {
          try {
            const { attemptsGraded, failed } = await recomputeExamResults(examId);
            if (failed) toast.warning(`Re-graded ${attemptsGraded}; ${failed} failed. See the server log.`);
            else toast.success(`Re-graded ${attemptsGraded} attempt(s)`);
            refresh();
          } catch (err) {
            toast.error(getErrorMessage(err));
          }
        }}
      />
    </>
  );
}
