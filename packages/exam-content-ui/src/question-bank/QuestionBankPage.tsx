/**
 * Owner: Person B. The bank, navigated by cards: topic cards first; opening a
 * topic shows question-type cards, filters and the list (create, edit,
 * duplicate, archive, delete, import).
 * Navigation is the host's job (callbacks). Pass `query` + `onQueryChange`
 * to keep the filters in the URL (see bankQuery.ts); otherwise the page
 * keeps them itself.
 */
import { useState } from 'react';
import { QuestionStatus, type BankQuestionQuery, type BankQuestionSummary } from '@secure-exam/types';
import { errorMessage } from '../api/ExamContentApi';
import { Alert, Badge, Button, EmptyState, Select, Spinner } from '../ui';
import { countsFor, TopicCards, topicName, TypeCards } from './BankCards';
import { BankFilters, Pager } from './BankFilters';
import { BANK_PAGE_SIZE, toApiQuery } from './bankQuery';
import { useBankMutations, useBankQuestions, useTopicSummary } from './hooks';
import { ImportDialog } from './ImportDialog';
import { DIFFICULTY_LABEL, STATUS_LABEL, TYPE_LABEL, type CourseOption } from './labels';

export function QuestionBankPage({
  onCreate,
  onEdit,
  courses,
  query: controlledQuery,
  onQueryChange,
}: {
  onCreate: () => void;
  onEdit: (questionId: string) => void;
  courses?: CourseOption[];
  /** The filters, when the host keeps them (e.g. in the URL). */
  query?: BankQuestionQuery;
  onQueryChange?: (query: BankQuestionQuery) => void;
}) {
  const [ownQuery, setOwnQuery] = useState<BankQuestionQuery>({ page: 1, limit: BANK_PAGE_SIZE });
  const query = controlledQuery ?? ownQuery;
  const setQuery = onQueryChange ?? setOwnQuery;
  const [importOpen, setImportOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const openTopic = query.topicId;
  const list = useBankQuestions(toApiQuery(query), Boolean(openTopic));
  const summary = useTopicSummary(query.courseId);
  const m = useBankMutations();
  /** Any filter change goes back to page 1. */
  const filter = (patch: Partial<BankQuestionQuery>) => setQuery({ ...query, ...patch, page: 1 });

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };
  const remove = (q: BankQuestionSummary) => {
    if (window.confirm(`Delete "${q.text.slice(0, 80)}"? This can't be undone.`)) {
      void act(() => m.remove.mutateAsync(q.id));
    }
  };
  const toggleArchive = (q: BankQuestionSummary) =>
    act(() =>
      m.updateMeta.mutateAsync({
        id: q.id,
        data: { status: q.status === QuestionStatus.ARCHIVED ? QuestionStatus.READY : QuestionStatus.ARCHIVED },
      }),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-foreground">Question bank</h1>
        <div className="flex gap-2">
          <Button onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button variant="primary" onClick={onCreate}>
            New question
          </Button>
        </div>
      </div>

      {!openTopic ? (
        <div className="space-y-4">
          {courses && (
            <Select
              aria-label="Course"
              className="w-auto"
              value={query.courseId ?? ''}
              onChange={(e) => filter({ courseId: e.target.value || undefined })}
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          {summary.isError && <Alert>Couldn't load topics: {errorMessage(summary.error)}</Alert>}
          <TopicCards summary={summary.data} onOpen={(topicId) => filter({ topicId, type: undefined })} courseId={query.courseId} />
        </div>
      ) : (
        <div className="space-y-4">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => filter({ topicId: undefined, type: undefined })}>
              ← Topics
            </button>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">{topicName(summary.data, openTopic)}</span>
          </nav>
          <TypeCards counts={countsFor(summary.data, openTopic)} selected={query.type} onSelect={(type) => filter({ type })} />
          <BankFilters query={query} onChange={setQuery} courses={courses} hideTopicAndType />
          {actionError && <Alert>{actionError}</Alert>}

          {list.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : list.isError ? (
            <Alert>
              Couldn't load questions: {errorMessage(list.error)}{' '}
              <button type="button" className="underline" onClick={() => list.refetch()}>
                Retry
              </button>
            </Alert>
          ) : list.data && list.data.items.length === 0 ? (
            <EmptyState title="No questions match">Try other filters, or create a question.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Question</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Marks</th>
                    <th className="px-3 py-2">Topic</th>
                    <th className="px-3 py-2">Difficulty</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Exams</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.data!.items.map((q) => (
                    <tr key={q.id} className="align-top hover:bg-muted">
                      <td className="max-w-md px-3 py-2">
                        <button type="button" className="text-left font-medium text-foreground hover:underline" onClick={() => onEdit(q.id)}>
                          {q.text.length > 140 ? `${q.text.slice(0, 140)}…` : q.text}
                        </button>
                        {q.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {q.tags.map((t) => (
                              <span key={t} className="text-xs text-muted-foreground">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-foreground">{TYPE_LABEL[q.type]}</td>
                      <td className="px-3 py-2 text-foreground">{q.marks}</td>
                      <td className="px-3 py-2 text-foreground">{q.topicName ?? '—'}</td>
                      <td className="px-3 py-2">
                        {q.difficulty ? <Badge tone={DIFFICULTY_LABEL[q.difficulty].tone}>{DIFFICULTY_LABEL[q.difficulty].text}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS_LABEL[q.status].tone}>{STATUS_LABEL[q.status].text}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-foreground">
                        {q.usedInExams}
                        {q.locked && (
                          <span className="ml-1" title="In an exam that has started: content is locked">
                            <Badge tone="violet">Locked</Badge>
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => onEdit(q.id)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => act(() => m.duplicate.mutateAsync(q.id))}>
                          Duplicate
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleArchive(q)}>
                          {q.status === QuestionStatus.ARCHIVED ? 'Restore' : 'Archive'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={q.usedInExams > 0}
                          title={q.usedInExams > 0 ? 'Remove it from its exams first, or archive it' : undefined}
                          onClick={() => remove(q)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {list.data && list.data.total > 0 && (
            <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={(page) => setQuery({ ...query, page })} />
          )}
        </div>
      )}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
