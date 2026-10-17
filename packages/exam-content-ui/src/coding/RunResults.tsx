/** Owner: Person B. Results of the last Run / Run samples / Submit. */
import { CodeRunKind } from '@secure-exam/types';
import { Badge } from '../ui';
import type { LastAction } from './hooks/useCodeRun';
import { STATUS_LABEL, VERDICT_LABEL } from './labels';
import { SampleBlock } from './ProblemStatement';

export function RunResults({ last }: { last: LastAction }) {
  if (!last) {
    return (
      <p className="text-sm text-slate-500">
        <b>Run</b> uses your custom input. <b>Run samples</b> checks the examples. <b>Submit</b> grades your code
        against all tests; your last submission counts.
      </p>
    );
  }

  if (last.kind === 'submit') {
    const r = last.result;
    return (
      <div className="space-y-3" data-testid="submit-result">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-base font-semibold text-slate-900">
            Score {r.score} / {r.maxScore}
          </span>
          <span className="text-sm text-slate-600">
            {r.passed} of {r.total} tests passed
          </span>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {r.tests.map((t) => {
            const v = VERDICT_LABEL[t.verdict];
            return (
              <li key={t.index} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-sm">
                <span className="text-slate-700">{t.isSample ? `Sample ${t.index}` : `Test ${t.index}`}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{t.timeMs} ms</span>
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
          <span className="text-xs text-slate-500">{r.outcome.timeMs} ms</span>
        </div>
        <SampleBlock label="Output" text={r.outcome.stdout} />
        {r.outcome.stderr && <SampleBlock label="Errors" text={r.outcome.stderr} />}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="samples-result">
      {(r.samples ?? []).map((sample) => {
        const v = VERDICT_LABEL[sample.verdict];
        return (
          <div key={sample.index} className="space-y-2 rounded-md border border-slate-200 p-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-800">Sample {sample.index}</span>
              <Badge tone={v.tone}>{v.text}</Badge>
              <span className="text-xs text-slate-400">{sample.timeMs} ms</span>
            </div>
            <div className="flex flex-col gap-2 lg:flex-row">
              <SampleBlock label="Input" text={sample.input} />
              <SampleBlock label="Expected" text={sample.expectedOutput} />
              <SampleBlock label="Your output" text={sample.stdout} />
            </div>
            {sample.stderr && <SampleBlock label="Errors" text={sample.stderr} />}
          </div>
        );
      })}
    </div>
  );
}
