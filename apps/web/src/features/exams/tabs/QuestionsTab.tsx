// Owner: Person A (port of the Phase 1 screen). Person B's Add-to-exam dialog
// (exam-content-ui) replaces the old inline "add from bank" list.

import { PickForExamDialog } from '@secure-exam/exam-content-ui';
import { getExamQuestions, removeQuestionFromExam } from '@secure-exam/api-client';
import type { QuestionWithOptions } from '@secure-exam/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileQuestion, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useCourseOptions } from '@/features/question-bank/useCourseOptions';
import { getErrorMessage } from '@/lib/errors';
import type { ExamTabProps } from '../examTabs.registry';

const TYPE_LABELS: Record<string, string> = {
  MCQ_SINGLE: 'Single choice',
  MCQ_MULTI: 'Multiple choice',
  TRUE_FALSE: 'True / false',
  CODING: 'Coding',
};

export function QuestionsTab({ exam }: ExamTabProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const courses = useCourseOptions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const inExam = useQuery({ queryKey: ['exams', exam.id, 'questions'], queryFn: () => getExamQuestions(exam.id) });
  const locked = !!exam.publishedAt;

  async function run(id: string, action: () => Promise<unknown>, done: string) {
    setBusyId(id);
    try {
      await action();
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: ['exams', exam.id, 'questions'] });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (inExam.error) return <ErrorState message={getErrorMessage(inExam.error)} onRetry={() => inExam.refetch()} />;

  const totalMarks = (inExam.data ?? []).reduce((sum, item) => sum + item.marks, 0);

  return (
    <div className="space-y-6">
      {locked && <Alert variant="info">This exam is published, so its questions are locked here to protect students already registered.</Alert>}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            In this exam ({inExam.data?.length ?? 0}) · {totalMarks} marks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inExam.isPending ? (
            <TableSkeleton rows={3} columns={3} />
          ) : inExam.data.length === 0 ? (
            <EmptyState icon={FileQuestion} title="No questions yet" description="Add questions from the bank below." />
          ) : (
            <ol className="divide-y rounded-md border">
              {inExam.data.map((item, i) => (
                <QuestionRow key={item.id} index={i + 1} question={item}>
                  {!locked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busyId === item.id}
                      onClick={() => run(item.id, () => removeQuestionFromExam(exam.id, item.id), 'Question removed')}
                    >
                      <Minus /> Remove
                    </Button>
                  )}
                </QuestionRow>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {!locked && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Add from the question bank</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus /> Add questions…
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Pick ready questions from the bank, including coding problems. Questions can be added until the exam is published.
            </p>
          </CardContent>
        </Card>
      )}
      <PickForExamDialog
        examId={exam.id}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        courses={courses}
        onAdded={() => queryClient.invalidateQueries({ queryKey: ['exams', exam.id, 'questions'] })}
      />
    </div>
  );
}

function QuestionRow({ question, index, children }: { question: QuestionWithOptions; index?: number; children?: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p>
          {index !== undefined && <span className="mr-2 text-muted-foreground">{index}.</span>}
          {question.text}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{TYPE_LABELS[question.type] ?? question.type}</Badge>
          <Badge variant="outline">
            {question.marks} mark{question.marks === 1 ? '' : 's'}
            {question.negativeMarks ? ` · −${question.negativeMarks}` : ''}
          </Badge>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}
