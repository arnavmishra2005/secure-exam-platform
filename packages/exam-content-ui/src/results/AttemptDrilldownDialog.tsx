/**
 * Owner: Person B. One student's attempt, question by question (staff), with
 * manual mark adjustment per question (#13), in the style of Moodle's
 * "Make comment or override mark": the automatic score stays visible, the
 * marker sets a new mark (or adds/takes away marks) and must give a reason.
 */
import { lazy, Suspense, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AttemptStatus, CODE_LANGUAGES, QuestionType, type DrilldownQuestion } from '@secure-exam/types';
import { errorMessage, useExamContentApi } from '../api/ExamContentApi';
import { SampleBlock } from '../coding/ProblemStatement';
import { VERDICT_LABEL } from '../coding/labels';
import { Alert, Badge, Button, Dialog, Input, Spinner, Textarea, cx } from '../ui';
import { CELL_STYLE, signed } from './cellStyles';

const CodeEditor = lazy(() => import('../coding/editor/CodeEditor').then((m) => ({ default: m.CodeEditor })));

const CODE_SOURCE = {
  FINAL_SUBMIT: 'Last submission before the end (counted)',
  FINAL_DRAFT: 'Saved draft, graded at the end (never submitted)',
  SUBMITTED: 'Submitted (not graded yet)',
  DRAFT: 'Saved draft (not graded yet)',
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "Adjust marks" form for one question. */
function AdjustMarks({
  examId,
  attemptId,
  q,
  onDone,
}: {
  examId: string;
  attemptId: string;
  q: DrilldownQuestion;
  onDone: () => void;
}) {
  const api = useExamContentApi();
  const qc = useQueryClient();
  const auto = q.adjustment ? q.adjustment.autoScore : (q.score ?? 0);
  const [mode, setMode] = useState<'score' | 'adjustment'>('score');
  const [value, setValue] = useState(String(q.score ?? auto));
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: (body: { score?: number; adjustment?: number; reason: string }) =>
      api.adjustQuestionScore(examId, attemptId, q.id, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['question-analytics', examId] });
      onDone();
    },
  });

  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n);
  const newScore = valid ? round2(mode === 'score' ? n : auto + n) : null;
  const inRange = newScore !== null && newScore >= 0 && newScore <= q.marks;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!inRange || !reason.trim()) return;
    save.mutate({ ...(mode === 'score' ? { score: n } : { adjustment: n }), reason: reason.trim() });
  };
  const remove = () => {
    if (!reason.trim()) return;
    save.mutate({ adjustment: 0, reason: reason.trim() });
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-border bg-muted p-3" aria-label={`Adjust marks for Q${q.number}`}>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <span className="text-muted-foreground">Automatic score: {auto} / {q.marks}</span>
        <label className="flex items-center gap-1">
          <input type="radio" name={`mode-${q.id}`} checked={mode === 'score'} onChange={() => { setMode('score'); setValue(String(q.score ?? auto)); }} />
          Set mark to
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name={`mode-${q.id}`} checked={mode === 'adjustment'} onChange={() => { setMode('adjustment'); setValue('0'); }} />
          Add / take away
        </label>
        <Input
          aria-label={mode === 'score' ? 'New mark' : 'Marks to add (negative to take away)'}
          type="number"
          step="0.25"
          className="w-24"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {newScore !== null && (
          <span className={cx('text-sm', inRange ? 'text-foreground' : 'text-destructive')}>
            → {newScore} / {q.marks}
            {!inRange && ` (must be 0–${q.marks})`}
          </span>
        )}
      </div>
      <Textarea
        aria-label="Reason"
        rows={2}
        maxLength={500}
        placeholder="Why the marks change (kept in the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" type="submit" disabled={!inRange || !reason.trim()} busy={save.isPending}>
          Save
        </Button>
        {q.adjustment && (
          <Button size="sm" variant="ghost" onClick={remove} disabled={!reason.trim() || save.isPending} title="Go back to the automatic score">
            Remove adjustment
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function QuestionDetail({
  q,
  examId,
  attemptId,
  canAdjust,
}: {
  q: DrilldownQuestion;
  examId: string;
  attemptId: string;
  canAdjust: boolean;
}) {
  const style = CELL_STYLE[q.state];
  const [adjusting, setAdjusting] = useState(false);
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          Q{q.number}. {q.text}
        </h3>
        <span className="flex items-center gap-2 text-sm">
          {q.markedForReview && <Badge tone="violet">Marked for review</Badge>}
          <span className={cx('rounded px-2 py-0.5 text-xs font-medium', style.className)}>
            {style.symbol} {style.label}
          </span>
          {q.adjustment && (
            <span className="text-xs text-muted-foreground" data-testid={`adjusted-${q.number}`}>
              auto {q.adjustment.autoScore} · adjusted {signed(q.adjustment.adjustment)} →
            </span>
          )}
          <span className="font-medium text-foreground">{q.score === null ? '—' : q.score} / {q.marks}</span>
          {canAdjust && q.score !== null && !adjusting && (
            <Button size="sm" variant="ghost" onClick={() => setAdjusting(true)}>
              Adjust
            </Button>
          )}
        </span>
      </header>
      {q.adjustment && (
        <p className="text-xs text-muted-foreground">
          “{q.adjustment.reason}” — {q.adjustment.adjustedByName ?? 'someone'}
          {q.adjustment.adjustedAt && `, ${new Date(q.adjustment.adjustedAt).toLocaleString()}`}
        </p>
      )}
      {adjusting && <AdjustMarks examId={examId} attemptId={attemptId} q={q} onDone={() => setAdjusting(false)} />}

      {q.options && (
        <ul className="space-y-1 text-sm">
          {q.options.map((o) => (
            <li
              key={o.id}
              className={cx(
                'flex items-center gap-2 rounded px-2 py-1',
                o.selected && o.isCorrect && 'bg-accent',
                o.selected && !o.isCorrect && 'bg-brick-light',
              )}
            >
              <span className="w-24 shrink-0 text-xs text-muted-foreground">
                {o.selected ? 'Selected' : ''}
                {o.selected && o.isCorrect ? ' ✓' : o.selected ? ' ✗' : ''}
              </span>
              <span className="text-foreground">{o.text}</span>
              {o.isCorrect && <Badge tone="green">Correct answer</Badge>}
            </li>
          ))}
        </ul>
      )}

      {q.type === QuestionType.CODING &&
        (q.code ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {CODE_LANGUAGES[q.code.language]?.shortLabel ?? q.code.language} · {CODE_SOURCE[q.code.source]}
              {q.code.status === 'PENDING' && q.code.source.startsWith('FINAL') && ' · being graded again'} · {q.code.submitCount} submit{q.code.submitCount === 1 ? '' : 's'},{' '}
              {q.code.runCount} run{q.code.runCount === 1 ? '' : 's'}
              {q.code.total > 0 && ` · ${q.code.passed}/${q.code.total} tests passed`}
            </p>
            <div className="h-64">
              <Suspense fallback={<Spinner />}>
                <CodeEditor
                  value={q.code.code}
                  language={CODE_LANGUAGES[q.code.language]?.monacoId}
                  readOnly
                  ariaLabel={`Q${q.number} submitted code`} />
              </Suspense>
            </div>
            {q.code.tests.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-foreground">Test results</summary>
                <div className="mt-2 space-y-2">
                  {q.code.tests.map((t) => (
                    <div key={t.index} className="space-y-2 rounded border border-border p-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{t.isSample ? `Sample ${t.index}` : `Test ${t.index}`}</span>
                        <Badge tone={VERDICT_LABEL[t.verdict].tone}>{VERDICT_LABEL[t.verdict].text}</Badge>
                        <span className="text-xs text-muted-foreground">
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
          <p className="text-sm text-muted-foreground">No code written.</p>
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
          <p className="text-sm text-muted-foreground">
            {q.data.student.email} · {q.data.student.status.replace('_', ' ').toLowerCase()} · answered{' '}
            {q.data.student.answeredCount} of {q.data.questions.length}
          </p>
          {q.data.questions.map((question) => (
            <QuestionDetail
              key={question.id}
              q={question}
              examId={examId}
              attemptId={attemptId!}
              canAdjust={[AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED].includes(q.data.student.status)}
            />
          ))}
        </div>
      ) : null}
    </Dialog>
  );
}
