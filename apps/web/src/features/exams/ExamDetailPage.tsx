// Owner: Person A
// Exam management: status transitions, publish, and the tab registry.

import { closeExam, deleteExam, getExam, scheduleExam, startExam } from '@secure-exam/api-client';
import { ExamStatus } from '@secure-exam/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, CalendarCheck, Play, Send, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { examTabs } from './examTabs.registry';
import { ExamStatusBadge, PublishedBadge } from './ExamStatusBadge';
import { PublishDialog } from './PublishDialog';

type Transition = { label: string; run: (id: string) => Promise<unknown>; confirm: string };

const transitions: Partial<Record<ExamStatus, Transition>> = {
  [ExamStatus.DRAFT]: { label: 'Schedule', run: scheduleExam, confirm: 'Timing becomes fixed once scheduled.' },
  [ExamStatus.SCHEDULED]: { label: 'Open now', run: startExam, confirm: 'Registered students can start as soon as the window opens.' },
  [ExamStatus.ACTIVE]: { label: 'Close exam', run: closeExam, confirm: 'No new attempts can start. Running attempts continue until their timer ends.' },
};

export default function ExamDetailPage() {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [publishing, setPublishing] = useState(false);
  const [confirming, setConfirming] = useState<'transition' | 'delete' | null>(null);
  const { data: exam, isPending, error, refetch } = useQuery({ queryKey: ['exams', examId], queryFn: () => getExam(examId) });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['exams'] });
  const tab = searchParams.get('tab') ?? examTabs[0].id;

  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;
  if (isPending || !exam) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const transition = transitions[exam.status];
  const icons = { [ExamStatus.DRAFT]: CalendarCheck, [ExamStatus.SCHEDULED]: Play, [ExamStatus.ACTIVE]: Square } as const;
  const TransitionIcon = icons[exam.status as keyof typeof icons];
  const canPublish = !exam.publishedAt && exam.status !== ExamStatus.CLOSED;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/admin/exams" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Exams
          </Link>
        }
        title={exam.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ExamStatusBadge status={exam.status} />
            <PublishedBadge exam={exam} />
            <span>
              {formatDateTime(exam.startTime)} – {formatDateTime(exam.endTime)} · {exam.durationMinutes} min · pass{' '}
              {exam.passPercentage}%
            </span>
          </span>
        }
        actions={
          <>
            {canPublish && (
              <Button onClick={() => setPublishing(true)}>
                <Send /> Publish
              </Button>
            )}
            {transition && (
              <Button variant="outline" onClick={() => setConfirming('transition')}>
                {TransitionIcon && <TransitionIcon />} {transition.label}
              </Button>
            )}
            {exam.status !== ExamStatus.DRAFT && (
              <Button variant="outline" asChild>
                <Link to={`/admin/results/${exam.id}`}>
                  <BarChart3 /> Results
                </Link>
              </Button>
            )}
            {exam.status === ExamStatus.DRAFT && (
              <Button variant="ghost" size="icon" aria-label="Delete draft" onClick={() => setConfirming('delete')}>
                <Trash2 />
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(next) => setSearchParams({ tab: next }, { replace: true })}>
        <TabsList className="flex-wrap">
          {examTabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {examTabs.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <t.component exam={exam} onChanged={refresh} />
          </TabsContent>
        ))}
      </Tabs>

      <PublishDialog exam={exam} open={publishing} onOpenChange={setPublishing} onPublished={refresh} />

      {transition && (
        <ConfirmDialog
          open={confirming === 'transition'}
          onOpenChange={(open) => !open && setConfirming(null)}
          title={`${transition.label}?`}
          description={transition.confirm}
          confirmLabel={transition.label}
          onConfirm={async () => {
            try {
              await transition.run(exam.id);
              toast.success(`${transition.label}: done`);
              refresh();
            } catch (err) {
              toast.error(getErrorMessage(err));
            }
          }}
        />
      )}
      <ConfirmDialog
        open={confirming === 'delete'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Delete this draft?"
        description="The exam and its question links are removed. Questions stay in the bank."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await deleteExam(exam.id);
            toast.success('Draft deleted');
            refresh();
            navigate('/admin/exams', { replace: true });
          } catch (err) {
            toast.error(getErrorMessage(err));
          }
        }}
      />
    </>
  );
}
