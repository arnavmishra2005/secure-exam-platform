/** Owner: Person B. "Test reference solution" for the coding problem being edited. */
import { useMutation } from '@tanstack/react-query';
import { TestCaseVerdict, type CodingProblemInput } from '@secure-exam/types';
import { errorMessage, useExamContentApi } from '../../api/ExamContentApi';
import { Alert, Badge, Button } from '../../ui';
import { VERDICT_LABEL } from '../labels';
import { SampleBlock } from '../ProblemStatement';

export function ValidateSolution({ coding, disabled }: { coding: CodingProblemInput; disabled?: boolean }) {
  const api = useExamContentApi();
  const check = useMutation({ mutationFn: () => api.validateCodingProblem({ coding }) });
  const res = check.data;
  const hasSolution = !!coding.referenceSolution?.trim();

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => check.mutate()} disabled={disabled || !hasSolution || coding.tests.length === 0} busy={check.isPending}>
          Test reference solution
        </Button>
        <span className="text-xs text-slate-500">
          {hasSolution
            ? 'Runs the reference solution against every test above (unsaved changes included).'
            : 'Add a reference solution to check your expected outputs.'}
        </span>
      </div>

      {check.isError && <Alert>{errorMessage(check.error)}</Alert>}
      {res && (
        <div className="space-y-2" data-testid="validation-result">
          <Alert tone={res.ok ? 'green' : 'red'}>
            {res.ok
              ? `All ${res.total} tests pass with the reference solution.`
              : `${res.total - res.passed} of ${res.total} tests fail with the reference solution — check their expected output.`}
          </Alert>
          {res.slowestShareOfLimit > 0.5 && (
            <Alert tone="amber">
              The slowest test used {Math.round(res.slowestShareOfLimit * 100)}% of the time limit. Students' solutions are
              often slower; consider a higher limit.
            </Alert>
          )}
          <ul className="space-y-2">
            {res.tests.map((t) => (
              <li key={t.index} className="rounded border border-slate-200 bg-white p-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Test {t.index}</span>
                  {t.isSample && <Badge tone="blue">Sample</Badge>}
                  <Badge tone={VERDICT_LABEL[t.verdict].tone}>{VERDICT_LABEL[t.verdict].text}</Badge>
                  <span className="text-xs text-slate-400">{t.timeMs} ms</span>
                </div>
                {t.verdict !== TestCaseVerdict.PASSED && (
                  <div className="mt-2 flex flex-col gap-2 lg:flex-row">
                    <SampleBlock label="Expected" text={t.expectedOutput} />
                    <SampleBlock label="Reference solution printed" text={t.stdout} />
                    {t.stderr && <SampleBlock label="Errors" text={t.stderr} />}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
