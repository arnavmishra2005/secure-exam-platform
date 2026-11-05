/**
 * Owner: Person B. Authoring form for a coding problem: statement (Markdown
 * with preview), allowed languages with starter code for each (#16), limits,
 * comparison mode, reference solution (in any language) and test cases.
 * Controlled: the parent owns the value and saves it.
 */
import { lazy, Suspense, useState } from 'react';
import {
  CODE_LANGUAGE_ORDER,
  CODE_LANGUAGES,
  CodeLanguage,
  OutputComparisonMode,
  type CodingProblemInput,
} from '@secure-exam/types';
import { cx, Field, Input, Select, Spinner, Textarea } from '../../ui';
import { Markdown } from '../ProblemStatement';
import { TestCaseTable } from './TestCaseTable';
import { ValidateSolution } from './ValidateSolution';

// Monaco is heavy; load it only when this editor is shown.
const CodeEditor = lazy(() => import('../editor/CodeEditor').then((m) => ({ default: m.CodeEditor })));

export const EMPTY_PROBLEM: CodingProblemInput = {
  statementMd: '',
  starterCode: { [CodeLanguage.PYTHON]: '' },
  allowedLanguages: [CodeLanguage.PYTHON],
  referenceLanguage: CodeLanguage.PYTHON,
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
  const allowed = CODE_LANGUAGE_ORDER.filter((l) => (value.allowedLanguages ?? [CodeLanguage.PYTHON]).includes(l));
  const [starterTab, setStarterTab] = useState<CodeLanguage>(allowed[0] ?? CodeLanguage.PYTHON);
  const tab = allowed.includes(starterTab) ? starterTab : allowed[0];
  const referenceLanguage = value.referenceLanguage ?? CodeLanguage.PYTHON;

  const toggleLanguage = (language: CodeLanguage, on: boolean) => {
    const next = CODE_LANGUAGE_ORDER.filter((l) => (l === language ? on : allowed.includes(l)));
    if (next.length === 0) return; // at least one language
    set({ allowedLanguages: next });
    if (on) setStarterTab(language);
  };

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

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-foreground">Languages students may use</legend>
        <div className="flex flex-wrap gap-4">
          {CODE_LANGUAGE_ORDER.map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={allowed.includes(l)}
                disabled={disabled || (allowed.length === 1 && allowed[0] === l)}
                onChange={(e) => toggleLanguage(l, e.target.checked)}
              />
              {CODE_LANGUAGES[l].label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Programs read standard input and print to standard output. Java code must be in <code>public class Main</code>.
          Java gets twice the time limit for its start-up.
        </p>
      </fieldset>

      <Suspense fallback={<Spinner />}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">Starter code (shown to students)</span>
              {allowed.length > 1 && (
                <div role="tablist" aria-label="Starter code language" className="flex gap-1">
                  {allowed.map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="tab"
                      aria-selected={tab === l}
                      onClick={() => setStarterTab(l)}
                      className={cx(
                        'rounded px-2 py-0.5 text-xs',
                        tab === l ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-accent',
                      )}
                    >
                      {CODE_LANGUAGES[l].shortLabel}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="h-56">
              <CodeEditor
                key={tab}
                ariaLabel={`Starter code (${CODE_LANGUAGES[tab].shortLabel})`}
                language={CODE_LANGUAGES[tab].monacoId}
                value={value.starterCode?.[tab] ?? ''}
                readOnly={disabled}
                onChange={(code) => set({ starterCode: { ...value.starterCode, [tab]: code } })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty to give students the default {CODE_LANGUAGES[tab].shortLabel} template.{' '}
              {!disabled && (
                <button
                  type="button"
                  className="underline"
                  onClick={() => set({ starterCode: { ...value.starterCode, [tab]: CODE_LANGUAGES[tab].defaultStarter } })}
                >
                  Insert the default template
                </button>
              )}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">Reference solution (never shown to students)</span>
              <Select
                aria-label="Reference solution language"
                className="h-7 w-auto py-0 text-xs"
                value={referenceLanguage}
                disabled={disabled}
                onChange={(e) => set({ referenceLanguage: e.target.value as CodeLanguage })}
              >
                {CODE_LANGUAGE_ORDER.map((l) => (
                  <option key={l} value={l}>
                    {CODE_LANGUAGES[l].label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="h-56">
              <CodeEditor
                key={referenceLanguage}
                ariaLabel="Reference solution"
                language={CODE_LANGUAGES[referenceLanguage].monacoId}
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
