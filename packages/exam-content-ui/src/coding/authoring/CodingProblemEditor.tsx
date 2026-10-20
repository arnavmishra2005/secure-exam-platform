/**
 * Owner: Person B. Authoring form for a coding problem: statement (Markdown
 * with preview), starter code, limits, comparison mode, reference solution
 * and test cases. Controlled: the parent owns the value and saves it.
 */
import { lazy, Suspense, useState } from 'react';
import { CodeLanguage, OutputComparisonMode, type CodingProblemInput } from '@secure-exam/types';
import { Field, Input, Select, Spinner, Textarea } from '../../ui';
import { Markdown } from '../ProblemStatement';
import { TestCaseTable } from './TestCaseTable';
import { ValidateSolution } from './ValidateSolution';

// Monaco is heavy; load it only when this editor is shown.
const CodeEditor = lazy(() => import('../editor/CodeEditor').then((m) => ({ default: m.CodeEditor })));

export const EMPTY_PROBLEM: CodingProblemInput = {
  statementMd: '',
  starterCode: { [CodeLanguage.PYTHON]: '' },
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  comparisonMode: OutputComparisonMode.TRIM,
  referenceSolution: '',
  tests: [{ input: '', expectedOutput: '', isSample: true, weight: 1 }],
};

const COMPARISON_HELP: Record<OutputComparisonMode, string> = {
  [OutputComparisonMode.TRIM]: 'Ignores trailing spaces on each line and trailing blank lines (recommended).',
  [OutputComparisonMode.EXACT]: 'Output must match exactly, character for character.',
  [OutputComparisonMode.TOKENS]: 'Compares words/numbers only; spacing and line breaks are ignored.',
};

export function CodingProblemEditor({
  value,
  onChange,
  disabled,
}: {
  value: CodingProblemInput;
  onChange: (value: CodingProblemInput) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const set = (patch: Partial<CodingProblemInput>) => onChange({ ...value, ...patch });
  const mode = value.comparisonMode ?? OutputComparisonMode.TRIM;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Problem statement (Markdown)</span>
          <button type="button" className="text-xs text-accent-foreground underline" onClick={() => setPreview((p) => !p)}>
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {preview ? (
          <div className="min-h-[160px] rounded-md border border-border p-3">
            <Markdown source={value.statementMd || '_Nothing yet._'} />
          </div>
        ) : (
          <Textarea
            aria-label="Problem statement"
            rows={8}
            className="font-sans"
            value={value.statementMd}
            disabled={disabled}
            placeholder={'Describe the task, the input format and the output format.\n\nUse `code`, lists and headings as needed.'}
            onChange={(e) => set({ statementMd: e.target.value })}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Time limit per test (ms)" hint="100–10000">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={100}
              max={10000}
              step={100}
              value={value.timeLimitMs ?? 2000}
              disabled={disabled}
              onChange={(e) => set({ timeLimitMs: Number(e.target.value) })}
            />
          )}
        </Field>
        <Field label="Memory limit (MB)" hint="32–512">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={32}
              max={512}
              value={value.memoryLimitMb ?? 256}
              disabled={disabled}
              onChange={(e) => set({ memoryLimitMb: Number(e.target.value) })}
            />
          )}
        </Field>
        <Field label="Output comparison" hint={COMPARISON_HELP[mode]}>
          {(id) => (
            <Select
              id={id}
              value={mode}
              disabled={disabled}
              onChange={(e) => set({ comparisonMode: e.target.value as OutputComparisonMode })}
            >
              <option value={OutputComparisonMode.TRIM}>Ignore trailing whitespace</option>
              <option value={OutputComparisonMode.EXACT}>Exact</option>
              <option value={OutputComparisonMode.TOKENS}>Tokens only</option>
            </Select>
          )}
        </Field>
      </div>

      <Suspense fallback={<Spinner />}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1">
            <span className="text-sm font-medium text-foreground">Starter code (shown to students)</span>
            <div className="h-56">
              <CodeEditor
                ariaLabel="Starter code"
                value={value.starterCode?.[CodeLanguage.PYTHON] ?? ''}
                readOnly={disabled}
                onChange={(code) => set({ starterCode: { ...value.starterCode, [CodeLanguage.PYTHON]: code } })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-sm font-medium text-foreground">Reference solution (never shown to students)</span>
            <div className="h-56">
              <CodeEditor
                ariaLabel="Reference solution"
                value={value.referenceSolution ?? ''}
                readOnly={disabled}
                onChange={(code) => set({ referenceSolution: code })}
              />
            </div>
          </div>
        </div>
      </Suspense>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Test cases</h3>
        <TestCaseTable tests={value.tests} onChange={(tests) => set({ tests })} disabled={disabled} />
      </div>

      <ValidateSolution coding={value} />
    </div>
  );
}
