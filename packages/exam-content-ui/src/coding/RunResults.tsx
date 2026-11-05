/** Owner: Person B. Results of the last Run / Run samples / Submit. */
import { CodeRunKind, CodeSubmissionStatus, type CodeErrorInfo } from '@secure-exam/types';
import { Alert, Badge } from '../ui';
import type { LastAction } from './hooks/useCodeRun';
import { ERROR_KIND_LABEL, errorTitle, STATUS_LABEL, VERDICT_LABEL } from './labels';
import { SampleBlock } from './ProblemStatement';

/** A clear title and hint for a failed run, with the raw error output folded away below. */
function ErrorDetails({ error, stderr }: { error?: CodeErrorInfo; stderr: string }) {
  if (!error) return stderr ? <SampleBlock label="Errors" text={stderr} /> : null;
  return (
    <div className="space-y-2" data-testid="run-error">
      <Alert tone="amber">
        <p className="font-semibold">{errorTitle(error)}</p>
        <p>{ERROR_KIND_LABEL[error.kind].hint}</p>
      </Alert>
      {stderr && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Full error output</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-xs text-foreground">
            {stderr}
          </pre>
        </details>
      )}
    </div>
  );
}

export function RunResults({ last }: { last: LastAction }) {
  if (!last) {
    return (
      <p className="text-sm text-muted-foreground">
        <b>Run</b> uses your custom input. <b>Run samples</b> checks the examples. <b>Submit</b> saves this code as your
        final answer; it's graded on all tests after the exam. You can submit again — the last submission counts.
      </p>
    );
  }

  if (last.kind === 'submit') {
    const { status, savedAt, result } = last.result;
    if (status === CodeSubmissionStatus.PENDING || !result) {
      return (
        <div data-testid="submit-result">
          <Alert tone="green">
            Saved as your final answer at {new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
            It will be graded on all test cases after the exam.
          </Alert>
        </div>
      );
    }
    return (
      <div className="space-y-3" data-testid="submit-result">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-base font-semibold text-foreground">
            Score {result.score} / {result.maxScore}
          </span>
          <span className="text-sm text-muted-foreground">
            {result.passed} of {result.total} tests passed
          </span>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {result.tests.map((t) => {
            const v = VERDICT_LABEL[t.verdict];
            return (
              <li key={t.index} className="flex items-center justify-between rounded border border-border px-2 py-1 text-sm">
                <span className="text-foreground">{t.isSample ? `Sample ${t.index}` : `Test ${t.index}`}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t.timeMs} ms</span>
                  {t.errorKind && (
                    <span className="text-xs text-muted-foreground">{ERROR_KIND_LABEL[t.errorKind].title}</span>
                  )}
                  <Badge tone={v.tone}>{v.text}</Badge>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const r = last.result;
  if (r.kind === CodeRunKind.CUSTOM && r.outcome) {
    const s = STATUS_LABEL[r.outcome.status];
    return (
      <div className="space-y-2" data-testid="run-result">
        <div className="flex items-center gap-2">
          <Badge tone={s.tone}>{s.text}</Badge>
          <span className="text-xs text-muted-foreground">
            {r.outcome.timeMs} ms{last.where === 'server' ? ' · ran on the server' : ''}
          </span>
        </div>
        <ErrorDetails error={r.outcome.error} stderr={r.outcome.stderr} />
        <SampleBlock label="Output" text={r.outcome.stdout} />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="samples-result">
      {(r.samples ?? []).map((sample) => {
        const v = VERDICT_LABEL[sample.verdict];
        return (
          <div key={sample.index} className="space-y-2 rounded-md border border-border p-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Sample {sample.index}</span>
              <Badge tone={v.tone}>{v.text}</Badge>
              <span className="text-xs text-muted-foreground">{sample.timeMs} ms</span>
            </div>
            <ErrorDetails error={sample.error} stderr={sample.stderr} />
            <div className="flex flex-col gap-2 lg:flex-row">
              <SampleBlock label="Input" text={sample.input} />
              <SampleBlock label="Expected" text={sample.expectedOutput} />
              <SampleBlock label="Your output" text={sample.stdout} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
