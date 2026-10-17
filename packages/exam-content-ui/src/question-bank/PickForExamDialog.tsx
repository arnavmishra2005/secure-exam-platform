/**
 * Owner: Person B. Pick READY bank questions to add to an exam. Used from
 * the exam editor (Person A's page): <PickForExamDialog examId=… open onClose onAdded />.
 */
import { useState } from 'react';
import { QuestionStatus, type BankQuestionQuery, type BulkAddToExamResult } from '@secure-exam/types';
import { errorMessage } from '../api/ExamContentApi';
import { Alert, Badge, Button, Dialog, EmptyState, Spinner } from '../ui';
import { BankFilters, Pager } from './BankFilters';
import { useBankMutations, useBankQuestions } from './hooks';
import { DIFFICULTY_LABEL, TYPE_LABEL, type CourseOption } from './labels';

export function PickForExamDialog({
  examId,
  open,
  onClose,
  onAdded,
  courses,
}: {
  examId: string;
  open: boolean;
  onClose: () => void;
  onAdded?: (result: BulkAddToExamResult) => void;
  courses?: CourseOption[];
}) {
  const [query, setQuery] = useState<BankQuestionQuery>({ page: 1, limit: 10 });
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<BulkAddToExamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useBankQuestions({ ...query, status: QuestionStatus.READY, excludeExamId: examId });
  const { addToExam } = useBankMutations();

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const close = () => {
    setSelected([]);
    setResult(null);
    setError(null);
    onClose();
  };
  const add = async () => {
    setError(null);
    try {
      const res = await addToExam.mutateAsync({ examId, ids: selected });
      setResult(res);
      setSelected([]);
      onAdded?.(res);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      wide
      title="Add questions from the bank"
      onClose={close}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-600">{selected.length} selected (added in this order)</span>
          <Button onClick={close}>Close</Button>
          <Button variant="primary" disabled={selected.length === 0} busy={addToExam.isPending} onClick={add}>
            Add to exam
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <BankFilters query={query} onChange={setQuery} courses={courses} hideStatus />
        {error && <Alert>{error}</Alert>}
        {result && (
          <Alert tone={result.skipped.length ? 'amber' : 'green'}>
            Added {result.added.length}.
            {result.skipped.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {result.skipped.map((s) => (
                  <li key={s.questionId}>{s.reason}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        {list.isLoading ? (
          <Spinner />
        ) : list.isError ? (
          <Alert>{errorMessage(list.error)}</Alert>
        ) : list.data!.items.length === 0 ? (
          <EmptyState title="No more Ready questions match">Questions already in this exam are hidden.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {list.data!.items.map((q) => (
              <li key={q.id}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(q.id)}
                    onChange={() => toggle(q.id)}
                    aria-label={`Select ${q.text}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-900">{q.text}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{TYPE_LABEL[q.type]}</span>
                      <span>{q.marks} marks</span>
                      {q.topicName && <span>{q.topicName}</span>}
                      {q.difficulty && <Badge tone={DIFFICULTY_LABEL[q.difficulty].tone}>{DIFFICULTY_LABEL[q.difficulty].text}</Badge>}
                    </span>
                  </span>
                  {selected.includes(q.id) && <Badge tone="blue">#{selected.indexOf(q.id) + 1}</Badge>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {list.data && list.data.total > 0 && (
          <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={(page) => setQuery({ ...query, page })} />
        )}
      </div>
    </Dialog>
  );
}
