/**
 * Owner: Person B. The coding question inside the exam page.
 *
 * Host contract (exam-taking page):
 *  - `question` is the PublicQuestion from GET /attempts/:id/questions (has `coding`).
 *  - `savedCode` is the answer's textResponse (the saved draft), if any.
 *  - `onSaveDraft(code)` must persist through the exam's saveAnswer()
 *    ({ textResponse: code }) so drafts survive offline and are graded at the
 *    end if the student never presses Submit.
 *  - `localRunner` runs Run / Run samples on this PC (Person C's Electron app:
 *    `desktopLocalRunner()`). Without it, Run uses the server if allowed.
 */
import { useCallback, useState } from 'react';
import {
  CODE_MAX_LENGTH,
  CodeLanguage,
  CodeRunKind,
  CodeSubmissionStatus,
  type LocalRunner,
  type PublicQuestion,
} from '@secure-exam/types';
import { Alert, Badge, Button, Textarea, cx } from '../ui';
import { SplitPane } from '../ui/SplitPane';
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
  /** Runs code on this PC (Person C's Electron app). */
  localRunner?: LocalRunner;
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
  localRunner,
}: CodingQuestionViewProps) {
  const problem = question.coding;
  const starter = problem?.starterCode?.[CodeLanguage.PYTHON] ?? '';
  const [code, setCode] = useState(savedCode ?? starter);
  const [stdin, setStdin] = useState(problem?.samples[0]?.input ?? '');
  const [last, setLast] = useState<LastAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteBlocked, setPasteBlocked] = useState(false);

  const { status: draftStatus } = useDebouncedDraft(code, onSaveDraft, draftDelayMs);
  const { run, submit, busy, canRun, configLoading } = useCodeRun(attemptId, question.id, problem, localRunner);

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
    : tooLong
      ? `Code is longer than ${CODE_MAX_LENGTH.toLocaleString()} characters.`
      : null;
  // Local runs work offline; the server is needed for Submit and for server runs.
  const runReason =
    blockedReason ??
    (configLoading && !localRunner
      ? 'Checking where code can run…'
      : !canRun
        ? "Running code isn't available on this computer. Your answer is still saved."
        : !localRunner && !online
          ? 'You are offline. Your draft is saved on this device; running code needs the server.'
          : null);
  const submitReason = blockedReason ?? (!online ? 'You are offline. Your draft is saved on this device; Submit needs the server.' : null);
  const canRun2 = !busy && !runReason && !empty;
  const canSubmit = !busy && !submitReason && !empty;

  const doRun = (kind: CodeRunKind) => {
    setError(null);
    run.mutate(
      { code, kind, stdin: kind === CodeRunKind.CUSTOM ? stdin : undefined },
      {
        onSuccess: ({ result, where }) => setLast({ kind: 'run', result, where }),
        onError: (e) => setError(friendlyRunError(e)),
      },
    );
  };
  const doSubmit = () => {
    setError(null);
    submit.mutate(code, {
      onSuccess: (result) => setLast({ kind: 'submit', result }),
      onError: (e) => setError(friendlyRunError(e)),
    });
  };
  const submittedAt =
    last?.kind === 'submit'
      ? last.result.status === CodeSubmissionStatus.PENDING
        ? new Date(last.result.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : `· ${last.result.result?.score} / ${last.result.result?.maxScore}`
      : null;
  const resetToStarter = () => {
    if (code === starter || window.confirm('Replace your code with the starter code?')) setCode(starter);
  };

  const statementPane = (
    <div className="h-full overflow-y-auto rounded-lg border border-border bg-card p-4">
      <ProblemStatement title={question.text} marks={question.marks} problem={problem} />
    </div>
  );

  const editorPane = (
    <div className="flex h-full min-h-[160px] flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">Python 3.12</span>
        <span className="flex items-center gap-3">
          <span className={cx(tooLong ? 'text-destructive' : 'text-muted-foreground')}>
            {code.length.toLocaleString()} / {CODE_MAX_LENGTH.toLocaleString()}
          </span>
          <span className={cx(draftStatus === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
            {DRAFT_TEXT[draftStatus]}
          </span>
          {!readOnly && starter && (
            <button type="button" className="text-muted-foreground underline hover:text-foreground" onClick={resetToStarter}>
              Reset
            </button>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor
          value={code}
          onChange={setCode}
          readOnly={readOnly}
          hardened={hardened}
          onBlockedPaste={handleBlockedPaste}
        />
      </div>
      {pasteBlocked && <Alert tone="amber">Pasting text from outside the editor is not allowed during the exam.</Alert>}
    </div>
  );

  const runPane = (
    <div className="h-full overflow-y-auto rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="md:w-2/5">
          <label htmlFor={`stdin-${question.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">
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
            <Button onClick={() => doRun(CodeRunKind.CUSTOM)} disabled={!canRun2} busy={run.isPending && run.variables?.kind === CodeRunKind.CUSTOM}>
              Run
            </Button>
            <Button
              onClick={() => doRun(CodeRunKind.SAMPLES)}
              disabled={!canRun2 || problem.samples.length === 0}
              busy={run.isPending && run.variables?.kind === CodeRunKind.SAMPLES}
            >
              Run samples
            </Button>
            <Button variant="primary" onClick={doSubmit} disabled={!canSubmit} busy={submit.isPending}>
              Submit
            </Button>
            {submittedAt && <Badge tone="blue">Submitted {submittedAt}</Badge>}
          </div>
          {(runReason ?? submitReason) && <p className="text-xs text-muted-foreground">{runReason ?? submitReason}</p>}
          {error && <Alert>{error}</Alert>}
          <RunResults last={last} />
        </div>
      </div>
    </div>
  );

  // Draggable dividers: problem | workspace (wide screens; stacked on narrow ones),
  // and editor / run panel inside the workspace. Sizes are remembered per browser.
  return (
    <SplitPane
      className="h-full min-h-[600px]"
      direction="horizontal"
      defaultRatio={38}
      minRatio={20}
      maxRatio={65}
      collapseBelow={1024}
      storageKey="exam-content-ui:split:problem"
      label="Resize problem and editor"
      first={statementPane}
      second={
        <div className="h-full min-h-[560px]">
          <SplitPane
            className="h-full"
            direction="vertical"
            defaultRatio={60}
            minRatio={25}
            maxRatio={80}
            storageKey="exam-content-ui:split:editor"
            label="Resize editor and output"
            first={editorPane}
            second={runPane}
          />
        </div>
      }
    />
  );
}
