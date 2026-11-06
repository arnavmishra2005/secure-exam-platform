/**
 * Owner: Person B. The coding question inside the exam page.
 *
 * Host contract (exam-taking page):
 *  - `question` is the PublicQuestion from GET /attempts/:id/questions (has `coding`).
 *  - `savedCode` is the answer's textResponse (the saved draft), if any.
 *  - `onSaveDraft(text)` must persist through the exam's saveAnswer()
 *    ({ textResponse: text }) so drafts survive offline and are graded at the
 *    end only when the exam permits grading unsubmitted drafts. `text` is the
 *    code with its language (#16: encodeCodeDraft; plain text for Python), so
 *    the host stores it as is. `onCodeChange(text)` reports the same text on
 *    every edit and language switch.
 *  - `localRunner` runs Run / Run samples on this PC (Person C's Electron app:
 *    `desktopLocalRunner()`). Without it, Run uses the server if allowed.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  CODE_LANGUAGE_ORDER,
  CODE_LANGUAGES,
  CODE_MAX_LENGTH,
  CodeLanguage,
  CodeRunKind,
  decodeCodeDraft,
  defaultLanguage,
  encodeCodeDraft,
  starterFor,
  CodeSubmissionStatus,
  type LocalRunner,
  type CodeSubmitResponse,
  type LatestCodeSubmission,
  type PublicQuestion,
} from '@secure-exam/types';
import { Alert, Badge, Button, Select, Textarea, cx } from '../ui';
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
  onSaveDraft: (text: string) => void | Promise<void>;
  draftDelayMs?: number;
  /** The draft text (as saved by onSaveDraft) on every change. */
  onCodeChange?: (text: string) => void;
  onSubmitted?: (code: string, result: CodeSubmitResponse, language: CodeLanguage) => void;
  latestSubmission?: LatestCodeSubmission;
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
  onCodeChange, onSubmitted, latestSubmission,
  hardened = true,
  onBlockedPaste,
  online = true,
  readOnly = false,
  localRunner,
}: CodingQuestionViewProps) {
  const problem = question.coding;
  const allowed = CODE_LANGUAGE_ORDER.filter((l) => problem?.allowedLanguages?.includes(l));
  const languages = allowed.length > 0 ? allowed : [CodeLanguage.PYTHON];
  // The saved draft remembers its language; otherwise start in the question's default.
  const [initial] = useState(() => {
    const saved = decodeCodeDraft(savedCode);
    const language = saved.language && languages.includes(saved.language) ? saved.language : defaultLanguage(languages);
    return { language, code: saved.language === language && saved.code ? saved.code : null };
  });
  const [language, setLanguage] = useState<CodeLanguage>(initial.language);
  /** Code per language for this visit, so switching back keeps what was typed (like LeetCode). */
  const [codes, setCodes] = useState<Partial<Record<CodeLanguage, string>>>(() =>
    initial.code !== null ? { [initial.language]: initial.code } : {},
  );
  const starter = starterFor(problem?.starterCode, language);
  const code = codes[language] ?? starter;
  const setCode = useCallback((next: string) => setCodes((m) => ({ ...m, [language]: next })), [language]);
  const [stdin, setStdin] = useState(problem?.samples[0]?.input ?? '');
  const [last, setLast] = useState<LastAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteBlocked, setPasteBlocked] = useState(false);

  // The saved draft is the code in the selected language: that is what gets graded without a
  // Submit (when the exam allows it). The host sees the same text on every change.
  const draft = encodeCodeDraft(language, code);
  useEffect(() => { onCodeChange?.(draft); }, [draft, onCodeChange]);
  const changeCode = (value: string) => { setCode(value); onCodeChange?.(encodeCodeDraft(language, value)); };
  const { status: draftStatus } = useDebouncedDraft(draft, onSaveDraft, draftDelayMs);
  const { run, submit, busy, canRun, configLoading } = useCodeRun(attemptId, question.id, problem, localRunner, language);

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
  const doSubmit = async () => {
    setError(null);
    const submittedCode = code;
    const submittedLanguage = language;
    try {
      // mutateAsync keeps the host's confirmation callback alive if the student
      // navigates to another question before this request finishes.
      const result = await submit.mutateAsync(submittedCode);
      setLast({ kind: 'submit', result });
      onSubmitted?.(submittedCode, result, submittedLanguage);
    } catch (error) {
      setError(friendlyRunError(error));
    }
  };
  const submittedAt =
    last?.kind === 'submit'
      ? last.result.status === CodeSubmissionStatus.PENDING
        ? new Date(last.result.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : `· ${last.result.result?.score} / ${last.result.result?.maxScore}`
      : null;
  // Code and language must both match what was submitted.
  const submittedIsCurrent = !!latestSubmission && latestSubmission.code === code && latestSubmission.language === language;
  const switchLanguage = (next: CodeLanguage) => {
    if (next === language) return;
    const changed = code !== starter && code.trim() !== '';
    if (
      changed &&
      !window.confirm(
        `Switch to ${CODE_LANGUAGES[next].shortLabel}? Your ${CODE_LANGUAGES[language].shortLabel} code is kept while you stay on this question, ` +
          `but from now on your ${CODE_LANGUAGES[next].shortLabel} code is what gets saved and graded.`,
      )
    ) {
      return;
    }
    setLanguage(next);
    setLast(null);
    setError(null);
  };
  const resetToStarter = () => {
    if (code === starter || window.confirm('Replace your code with the starter code?')) changeCode(starter);
  };

  const statementPane = (
    <div className="h-full overflow-y-auto rounded-lg border border-border bg-card p-4">
      <ProblemStatement title={question.text} marks={question.marks} problem={problem} />
    </div>
  );

  const editorPane = (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        {languages.length > 1 ? (
          <Select
            aria-label="Language"
            className="h-7 w-auto py-0 text-xs"
            value={language}
            disabled={readOnly || busy}
            onChange={(e) => switchLanguage(e.target.value as CodeLanguage)}
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {CODE_LANGUAGES[l].label}
              </option>
            ))}
          </Select>
        ) : (
          <span className="font-medium text-muted-foreground">{CODE_LANGUAGES[language].label}</span>
        )}
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
          language={CODE_LANGUAGES[language].monacoId}
          onChange={changeCode}
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
            {latestSubmission ? <Badge tone={submittedIsCurrent ? 'blue' : 'amber'}>{submittedIsCurrent ? 'Submitted' : 'Changed since submission — submit again'}</Badge> : submittedAt && <Badge tone="blue">Submitted {submittedAt}</Badge>}
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
      className="h-auto lg:h-[clamp(560px,calc(100dvh-220px),900px)]"
      direction="horizontal"
      defaultRatio={38}
      minRatio={20}
      maxRatio={65}
      collapseBelow={1024}
      storageKey="exam-content-ui:split:problem"
      label="Resize problem and editor"
      first={statementPane}
      second={
        <div className="h-[560px] min-h-0 lg:h-full">
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
