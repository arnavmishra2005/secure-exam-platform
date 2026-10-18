/**
 * Owner: Person B. "Questions" tab of the exam results page (Person A's
 * tab host): per-question stats, the students × questions matrix ("who
 * answered what"), CSV export, and a per-student drill-down.
 * Refreshes every 30 s while the exam is ACTIVE.
 */
import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QuestionType, type AnalyticsCell, type QuestionAnalyticsMatrix, type QuestionStats } from '@secure-exam/types';
import { errorMessage, useExamContentApi } from '../api/ExamContentApi';
import { TYPE_LABEL } from '../question-bank/labels';
import { Alert, Button, EmptyState, Input, Spinner, cx } from '../ui';
import { AttemptDrilldownDialog } from './AttemptDrilldownDialog';
import { CELL_STYLE, cellTitle, pct } from './cellStyles';
import { matrixToCsv } from './csv';

function StatBar({ s }: { s: QuestionStats }) {
  const parts = [
    { n: s.correct, c: 'bg-emerald-500', l: 'correct' },
    { n: s.partial, c: 'bg-amber-400', l: 'partly correct' },
    { n: s.wrong, c: 'bg-red-400', l: 'wrong' },
    { n: s.pending, c: 'bg-sky-400', l: 'not graded yet' },
    { n: s.notAnswered, c: 'bg-slate-200', l: 'not answered' },
  ];
  if (s.attempts === 0) return <div className="h-2 rounded bg-slate-100" />;
  return (
    <div
      className="flex h-2 overflow-hidden rounded"
      role="img"
      aria-label={parts.map((p) => `${p.n} ${p.l}`).join(', ')}
    >
      {parts.map((p) => p.n > 0 && <div key={p.l} className={p.c} style={{ width: `${(p.n / s.attempts) * 100}%` }} />)}
    </div>
  );
}

function StatsTable({ m }: { m: QuestionAnalyticsMatrix }) {
  const [open, setOpen] = useState<string | null>(null);
  const statBy = new Map(m.stats.map((s) => [s.questionId, s]));
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Question</th>
            <th className="px-3 py-2">Type</th>
            <th className="w-48 px-3 py-2">Results</th>
            <th className="px-3 py-2 text-right">Correct</th>
            <th className="px-3 py-2 text-right">Avg score</th>
            <th className="px-3 py-2 text-right">Tests passed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {m.questions.map((q) => {
            const s = statBy.get(q.id)!;
            const hasOptions = !!s.optionCounts && !!q.options?.length;
            return (
              <Fragment key={q.id}>
                <tr className="align-top">
                  <td className="px-3 py-2 font-medium text-slate-700">Q{q.number}</td>
                  <td className="max-w-md px-3 py-2 text-slate-800">
                    {hasOptions ? (
                      <button type="button" className="text-left hover:underline" onClick={() => setOpen(open === q.id ? null : q.id)}>
                        {q.text}
                      </button>
                    ) : (
                      q.text
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{TYPE_LABEL[q.type]}</td>
                  <td className="px-3 py-3">
                    <StatBar s={s} />
                    <div className="mt-1 text-xs text-slate-500">
                      {s.answered}/{s.attempts} answered{s.pending > 0 && ` · ${s.pending} not graded yet`}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-800">{pct(s.accuracy)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-800">
                    {s.averageScore == null ? '—' : `${s.averageScore} / ${q.marks}`}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-800">
                    {q.type === QuestionType.CODING ? pct(s.testPassRate) : ''}
                  </td>
                </tr>
                {open === q.id && (
                  <tr>
                    <td />
                    <td colSpan={6} className="px-3 pb-3 text-xs text-slate-600">
                      <OptionBreakdown options={q.options ?? []} counts={s.optionCounts!} attempts={s.attempts} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OptionBreakdown({
  options,
  counts,
  attempts,
}: {
  options: { id: string; text: string; isCorrect: boolean }[];
  counts: Record<string, number>;
  attempts: number;
}) {
  return (
    <ul className="space-y-1">
      {options.map((o) => {
        const n = counts[o.id] ?? 0;
        return (
          <li key={o.id} className="flex items-center gap-2">
            <span className="w-56 truncate" title={o.text}>
              {o.isCorrect ? '✓ ' : ''}
              {o.text}
            </span>
            <span className="h-2 flex-1 rounded bg-slate-100">
              <span
                className={cx('block h-2 rounded', o.isCorrect ? 'bg-emerald-500' : 'bg-slate-400')}
                style={{ width: attempts ? `${(n / attempts) * 100}%` : 0 }}
              />
            </span>
            <span className="w-20 text-right">{n} chose it</span>
          </li>
        );
      })}
    </ul>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-slate-600" aria-label="Legend">
      {Object.values(CELL_STYLE).map((s) => (
        <li key={s.label} className="flex items-center gap-1">
          <span className={cx('inline-flex h-5 w-5 items-center justify-center rounded', s.className)}>{s.symbol}</span>
          {s.label}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> Marked for review
      </li>
    </ul>
  );
}

function Matrix({ m, onOpen }: { m: QuestionAnalyticsMatrix; onOpen: (attemptId: string) => void }) {
  const [search, setSearch] = useState('');
  const byKey = useMemo(() => new Map(m.cells.map((c) => [`${c.attemptId}|${c.questionId}`, c])), [m.cells]);
  const students = m.students.filter((s) =>
    `${s.fullName} ${s.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          aria-label="Search students"
          placeholder="Search students…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Legend />
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white" style={{ maxHeight: '70vh' }}>
        <table className="text-sm" aria-label="Who answered what">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2 text-left">Student</th>
              <th className="px-3 py-2 text-right">Score</th>
              {m.questions.map((q) => (
                <th key={q.id} className="px-1 py-2 text-center" title={q.text}>
                  Q{q.number}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s) => (
              <tr key={s.attemptId} className="hover:bg-slate-50">
                <th scope="row" className="sticky left-0 bg-white px-3 py-1.5 text-left font-normal">
                  <button type="button" className="text-left hover:underline" onClick={() => onOpen(s.attemptId)}>
                    <span className="block font-medium text-slate-900">{s.fullName}</span>
                    <span className="block text-xs text-slate-500">
                      {s.email}
                      {s.status === 'IN_PROGRESS' && ' · in progress'}
                    </span>
                  </button>
                </th>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-slate-800">
                  {s.score} / {s.maxScore}
                </td>
                {m.questions.map((q) => {
                  const c = byKey.get(`${s.attemptId}|${q.id}`) as AnalyticsCell | undefined;
                  if (!c) return <td key={q.id} />;
                  const style = CELL_STYLE[c.state];
                  return (
                    <td key={q.id} className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => onOpen(s.attemptId)}
                        title={cellTitle(c)}
                        aria-label={`${s.fullName}, Q${q.number}: ${cellTitle(c)}`}
                        className={cx('relative inline-flex h-7 w-9 items-center justify-center rounded text-xs font-semibold', style.className)}
                      >
                        {c.state === 'PARTIAL' ? c.score : style.symbol}
                        {c.markedForReview && (
                          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-violet-500" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {students.length === 0 && <p className="text-sm text-slate-500">No students match “{search}”.</p>}
    </div>
  );
}

/** Finished attempts whose coding answers are still being graded. */
function gradingPending(m: QuestionAnalyticsMatrix): number {
  const finished = new Set(m.students.filter((s) => s.status !== 'IN_PROGRESS').map((s) => s.attemptId));
  return m.cells.filter((c) => finished.has(c.attemptId) && c.state === 'PENDING').length;
}

export function QuestionsTab({ examId }: { examId: string }) {
  const api = useExamContentApi();
  const qc = useQueryClient();
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['question-analytics', examId],
    queryFn: () => api.getQuestionAnalytics(examId),
    // Live while the exam runs or while answers are being graded.
    refetchInterval: (query) =>
      query.state.data && (query.state.data.exam.status === 'ACTIVE' || gradingPending(query.state.data) > 0)
        ? 10_000
        : false,
  });
  const recalc = useMutation({
    mutationFn: () => api.recalculateResults(examId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['question-analytics', examId] }),
  });

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (q.isError) {
    return (
      <Alert>
        Couldn't load question results: {errorMessage(q.error)}{' '}
        <button type="button" className="underline" onClick={() => q.refetch()}>
          Retry
        </button>
      </Alert>
    );
  }
  const m = q.data!;

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([matrixToCsv(m)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m.exam.title.replace(/[^\w-]+/g, '_')}-question-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pending = gradingPending(m);
  const confirmRecalc = () => {
    if (
      window.confirm(
        'Recalculate every finished attempt with the current questions (marks, correct answers, tests)? ' +
          'This replaces any score you adjusted by hand.',
      )
    ) {
      recalc.mutate();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {m.students.length} attempt{m.students.length === 1 ? '' : 's'} · {m.questions.length} questions
          {m.exam.status === 'ACTIVE' && ' · live'}
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={confirmRecalc} busy={recalc.isPending} disabled={m.students.length === 0}>
            Recalculate results
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={m.students.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>
      {pending > 0 && (
        <Alert tone="blue">
          Grading in progress: {pending} coding answer{pending === 1 ? '' : 's'} from finished attempts still to grade.
          This page updates on its own.
        </Alert>
      )}
      {recalc.isError && <Alert>{errorMessage(recalc.error)}</Alert>}
      {recalc.data && (
        <Alert tone="green">
          Recalculated {recalc.data.recalculatedNow} of {recalc.data.attempts} results
          {recalc.data.queuedToRerun > 0 && `; ${recalc.data.queuedToRerun} coding answers are being graded again`}.
        </Alert>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">By question</h2>
        <StatsTable m={m} />
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">Who answered what</h2>
        {m.students.length === 0 ? (
          <EmptyState title="No attempts yet">Students appear here once they start the exam.</EmptyState>
        ) : (
          <Matrix m={m} onOpen={setOpenAttempt} />
        )}
      </section>

      <AttemptDrilldownDialog examId={examId} attemptId={openAttempt} onClose={() => setOpenAttempt(null)} />
    </div>
  );
}
