/**
 * Owner: Person B. The coding question inside the exam page.
 *
 * Host contract (exam-taking page):
 *  - `question` is the PublicQuestion from GET /attempts/:id/questions (has `coding`).
 *  - `savedCode` is the answer's textResponse (the saved draft), if any.
 *  - `onSaveDraft(code)` must persist through the exam's saveAnswer()
 *    ({ textResponse: code }) so drafts survive offline and are graded at the
 *    end if the student never presses Submit.
 */
import { useCallback, useState } from 'react';
import { CODE_MAX_LENGTH, CodeLanguage, CodeRunKind, type PublicQuestion } from '@secure-exam/types';
import { Alert, Badge, Button, Textarea, cx } from '../ui';
import { CodeEditor } from './editor/CodeEditor';
import { friendlyRunError, useCodeRun, type LastAction } from './hooks/useCodeRun';
import { useDebouncedDraft, type DraftStatus } from './hooks/useDebouncedDraft';
import { ProblemStatement } from './ProblemStatement';
import { RunResults } from './RunResults';

export interface CodingQuestionViewProps {
  attemptId: string;
  question: PublicQuestion;
  savedCode?: string | null;
  onSaveDraft: (code: string) => void | Promise<void>;
  draftDelayMs?: number;
  /** Exam mode: block external paste and the editor context menu. */
  hardened?: boolean;
  onBlockedPaste?: () => void;
  /** False while offline: drafts still save locally, but Run/Submit need the server. */
  online?: boolean;
  /** True once the attempt has ended. */
  readOnly?: boolean;
}

const DRAFT_TEXT: Record<DraftStatus, string> = {
  idle: '',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  saved: 'Draft saved',
  error: 'Draft not saved — it will retry on your next change',
};

export function CodingQuestionView({
  attemptId,
  question,
  savedCode,
  onSaveDraft,
  draftDelayMs = 1500,
  hardened = true,
  onBlockedPaste,
  online = true,
  readOnly = false,
}: CodingQuestionViewProps) {
  const problem = question.coding;
  const starter = problem?.starterCode?.[CodeLanguage.PYTHON] ?? '';
  const [code, setCode] = useState(savedCode ?? starter);
  const [stdin, setStdin] = useState(problem?.samples[0]?.input ?? '');
  const [last, setLast] = useState<LastAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteBlocked, setPasteBlocked] = useState(false);

  const { status: draftStatus } = useDebouncedDraft(code, onSaveDraft, draftDelayMs);
  const { run, submit, busy } = useCodeRun(attemptId, question.id);

  const handleBlockedPaste = useCallback(() => {
    setPasteBlocked(true);
    onBlockedPaste?.();
  }, [onBlockedPaste]);

  if (!problem) {
    return <Alert tone="amber">This coding question isn't available. Ask the invigilator for help.</Alert>;
  }

  const tooLong = code.length > CODE_MAX_LENGTH;
  const empty = code.trim().length === 0;
  const blockedReason = readOnly
    ? 'The attempt has ended.'
    : !online
      ? 'You are offline. Your draft is saved on this device; Run and Submit need the server.'
      : tooLong
        ? `Code is longer than ${CODE_MAX_LENGTH.toLocaleString()} characters.`
        : null;
  const canAct = !busy && !blockedReason && !empty;

  const doRun = (kind: CodeRunKind) => {
    setError(null);
    run.mutate(
      { code, kind, stdin: kind === CodeRunKind.CUSTOM ? stdin : undefined },
      { onSuccess: (result) => setLast({ kind: 'run', result }), onError: (e) => setError(friendlyRunError(e)) },
    );
  };
  const doSubmit = () => {
    setError(null);
    submit.mutate(code, {
      onSuccess: (result) => setLast({ kind: 'submit', result }),
      onError: (e) => setError(friendlyRunError(e)),
    });
  };
  const resetToStarter = () => {
    if (code === starter || window.confirm('Replace your code with the starter code?')) setCode(starter);
  };

  return (
    <div className="grid h-full min-h-[600px] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
        <ProblemStatement title={question.text} marks={question.marks} problem={problem} />
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-600">Python 3.12</span>
          <span className="flex items-center gap-3">
            <span className={cx(tooLong ? 'text-red-700' : 'text-slate-400')}>
              {code.length.toLocaleString()} / {CODE_MAX_LENGTH.toLocaleString()}
            </span>
            <span className={cx(draftStatus === 'error' ? 'text-red-700' : 'text-slate-500')} aria-live="polite">
              {DRAFT_TEXT[draftStatus]}
            </span>
            {!readOnly && starter && (
              <button type="button" className="text-slate-500 underline hover:text-slate-800" onClick={resetToStarter}>
                Reset
              </button>
            )}
          </span>
        </div>

        <div className="min-h-[300px] flex-1">
          <CodeEditor
            value={code}
            onChange={setCode}
            readOnly={readOnly}
            hardened={hardened}
            onBlockedPaste={handleBlockedPaste}
          />
        </div>
        {pasteBlocked && (
          <Alert tone="amber">Pasting text from outside the editor is not allowed during the exam.</Alert>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="md:w-2/5">
              <label htmlFor={`stdin-${question.id}`} className="mb-1 block text-xs font-medium text-slate-600">
                Custom input
              </label>
              <Textarea
                id={`stdin-${question.id}`}
                rows={4}
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                disabled={readOnly}
                className="text-xs"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => doRun(CodeRunKind.CUSTOM)} disabled={!canAct} busy={run.isPending && run.variables?.kind === CodeRunKind.CUSTOM}>
                  Run
                </Button>
                <Button
                  onClick={() => doRun(CodeRunKind.SAMPLES)}
                  disabled={!canAct || problem.samples.length === 0}
                  busy={run.isPending && run.variables?.kind === CodeRunKind.SAMPLES}
                >
                  Run samples
                </Button>
                <Button variant="primary" onClick={doSubmit} disabled={!canAct} busy={submit.isPending}>
                  Submit
                </Button>
                {last?.kind === 'submit' && <Badge tone="blue">Last submission: {last.result.score} / {last.result.maxScore}</Badge>}
              </div>
              {blockedReason && <p className="text-xs text-slate-500">{blockedReason}</p>}
              {error && <Alert>{error}</Alert>}
              <div className="max-h-72 overflow-y-auto">
                <RunResults last={last} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
