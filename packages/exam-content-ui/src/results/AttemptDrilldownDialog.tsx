/** Owner: Person B. One student's attempt, question by question (admin). */
import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QuestionType, type DrilldownQuestion } from '@secure-exam/types';
import { errorMessage, useExamContentApi } from '../api/ExamContentApi';
import { SampleBlock } from '../coding/ProblemStatement';
import { VERDICT_LABEL } from '../coding/labels';
import { Alert, Badge, Dialog, Spinner, cx } from '../ui';
import { CELL_STYLE } from './cellStyles';

const CodeEditor = lazy(() => import('../coding/editor/CodeEditor').then((m) => ({ default: m.CodeEditor })));

const CODE_SOURCE = {
  FINAL_SUBMIT: 'Last submission before the end (counted)',
  FINAL_DRAFT: 'Saved draft, graded at the end (never submitted)',
  SUBMITTED: 'Submitted (not graded yet)',
  DRAFT: 'Saved draft (not graded yet)',
} as const;

function QuestionDetail({ q }: { q: DrilldownQuestion }) {
  const style = CELL_STYLE[q.state];
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
          Q{q.number}. {q.text}
        </h3>
        <span className="flex items-center gap-2 text-sm">
          {q.markedForReview && <Badge tone="violet">Marked for review</Badge>}
          <span className={cx('rounded px-2 py-0.5 text-xs font-medium', style.className)}>
            {style.symbol} {style.label}
          </span>
          <span className="font-medium text-slate-700">{q.score === null ? '—' : q.score} / {q.marks}</span>
        </span>
      </header>

      {q.options && (
        <ul className="space-y-1 text-sm">
          {q.options.map((o) => (
            <li
              key={o.id}
              className={cx(
                'flex items-center gap-2 rounded px-2 py-1',
                o.selected && o.isCorrect && 'bg-emerald-50',
                o.selected && !o.isCorrect && 'bg-red-50',
              )}
            >
              <span className="w-24 shrink-0 text-xs text-slate-500">
                {o.selected ? 'Selected' : ''}
                {o.selected && o.isCorrect ? ' ✓' : o.selected ? ' ✗' : ''}
              </span>
              <span className="text-slate-800">{o.text}</span>
              {o.isCorrect && <Badge tone="green">Correct answer</Badge>}
            </li>
          ))}
        </ul>
      )}

      {q.type === QuestionType.CODING &&
        (q.code ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              {CODE_SOURCE[q.code.source]}
              {q.code.status === 'PENDING' && q.code.source.startsWith('FINAL') && ' · being graded again'} · {q.code.submitCount} submit{q.code.submitCount === 1 ? '' : 's'},{' '}
              {q.code.runCount} run{q.code.runCount === 1 ? '' : 's'}
              {q.code.total > 0 && ` · ${q.code.passed}/${q.code.total} tests passed`}
            </p>
            <div className="h-64">
              <Suspense fallback={<Spinner />}>
                <CodeEditor value={q.code.code} readOnly ariaLabel={`Q${q.number} submitted code`} />
              </Suspense>
            </div>
            {q.code.tests.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Test results</summary>
                <div className="mt-2 space-y-2">
                  {q.code.tests.map((t) => (
                    <div key={t.index} className="space-y-2 rounded border border-slate-200 p-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{t.isSample ? `Sample ${t.index}` : `Test ${t.index}`}</span>
                        <Badge tone={VERDICT_LABEL[t.verdict].tone}>{VERDICT_LABEL[t.verdict].text}</Badge>
                        <span className="text-xs text-slate-400">
                          weight {t.weight} · {t.timeMs} ms
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 lg:flex-row">
                        <SampleBlock label="Input" text={t.input} />
                        <SampleBlock label="Expected" text={t.expectedOutput} />
                        <SampleBlock label="Output" text={t.stdout} />
                      </div>
                      {t.stderr && <SampleBlock label="Errors" text={t.stderr} />}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No code written.</p>
        ))}
    </section>
  );
}

export function AttemptDrilldownDialog({
  examId,
  attemptId,
  onClose,
}: {
  examId: string;
  attemptId: string | null;
  onClose: () => void;
}) {
  const api = useExamContentApi();
  const q = useQuery({
    queryKey: ['question-analytics', examId, 'attempt', attemptId],
    queryFn: () => api.getAttemptDrilldown(examId, attemptId!),
    enabled: !!attemptId,
  });
  const s = q.data?.student;

  return (
    <Dialog open={!!attemptId} wide title={s ? `${s.fullName} — ${s.score} / ${s.maxScore}` : 'Attempt'} onClose={onClose}>
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <Alert>{errorMessage(q.error)}</Alert>
      ) : q.data ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {q.data.student.email} · {q.data.student.status.replace('_', ' ').toLowerCase()} · answered{' '}
            {q.data.student.answeredCount} of {q.data.questions.length}
          </p>
          {q.data.questions.map((question) => (
            <QuestionDetail key={question.id} q={question} />
          ))}
        </div>
      ) : null}
    </Dialog>
  );
}
