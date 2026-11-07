// Owner: Person A — tab host for one exam's results.

import { getExam, publishExamResults, recalculateResults } from '@secure-exam/api-client';
import { Permission } from '@secure-exam/types';
import { useAccess } from '@/auth/useAccess';
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
  const [confirm, setConfirm] = useState<'publish' | 'recalculate' | null>(null);
  const exam = useQuery({ queryKey: ['exams', examId], queryFn: () => getExam(examId) });
  const tab = searchParams.get('tab') ?? resultsTabs[0].id;
  const { can } = useAccess();
  const courseId = exam.data?.courseId;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['results'] });
    void queryClient.invalidateQueries({ queryKey: ['question-analytics', examId] });
  };

  if (exam.error) return <ErrorState message={getErrorMessage(exam.error)} onRetry={() => exam.refetch()} />;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/instructor/results" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Results
          </Link>
        }
        title={exam.data?.title ?? <Skeleton className="h-8 w-72" />}
        description={
          exam.data && (
            <span className="flex flex-wrap items-center gap-2">
              <ExamStatusBadge status={exam.data.status} />
              {formatDateTime(exam.data.startTime)} – {formatDateTime(exam.data.endTime)} ·{' '}
              {exam.data.passMarkEnabled ? `pass mark ${exam.data.passPercentage}%` : 'no pass mark'}
            </span>
          )
        }
        actions={
          <>
            {can(Permission.MARKS_ADJUST, courseId) && (
              <Button variant="outline" onClick={() => setConfirm('recalculate')}>
                <RefreshCw /> Recalculate results
              </Button>
            )}
            {can(Permission.RESULTS_PUBLISH, courseId) && (
              <Button onClick={() => setConfirm('publish')}>
                <Send /> Publish results
              </Button>
            )}
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
        open={confirm === 'recalculate'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Recalculate results?"
        description={
          'Re-scores every submitted attempt with the current questions: marks, negative marks, correct answers and coding ' +
          'test cases. Coding answers whose tests changed are run again. Marks you adjusted per question are kept; a ' +
          "changed total score is replaced."
        }
        confirmLabel="Recalculate"
        onConfirm={async () => {
          try {
            const r = await recalculateResults(examId);
            toast.success(
              `Recalculated ${r.recalculatedNow} of ${r.attempts} result(s)` +
                (r.queuedToRerun ? `; ${r.queuedToRerun} coding answer(s) are being graded again` : ''),
            );
            refresh();
          } catch (err) {
            toast.error(getErrorMessage(err));
          }
        }}
      />
    </>
  );
}
