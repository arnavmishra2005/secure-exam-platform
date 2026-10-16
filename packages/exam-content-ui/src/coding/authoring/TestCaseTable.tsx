/** Owner: Person B. Edit a coding question's test cases (order, sample flag, weight). */
import type { CodingTestCaseInput } from '@secure-exam/types';
import { Badge, Button, Input, Textarea } from '../../ui';

export function TestCaseTable({
  tests,
  onChange,
  disabled,
}: {
  tests: CodingTestCaseInput[];
  onChange: (tests: CodingTestCaseInput[]) => void;
  disabled?: boolean;
}) {
  const update = (i: number, patch: Partial<CodingTestCaseInput>) =>
    onChange(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= tests.length) return;
    const next = [...tests];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const totalWeight = tests.reduce((s, t) => s + (t.weight ?? 1), 0);
  const samples = tests.filter((t) => t.isSample).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {tests.length} tests · {samples} shown to students as examples · marks split by weight (total {totalWeight})
        </p>
        <Button
          size="sm"
          disabled={disabled || tests.length >= 50}
          onClick={() => onChange([...tests, { input: '', expectedOutput: '', isSample: false, weight: 1 }])}
        >
          Add test
        </Button>
      </div>
      {tests.map((t, i) => (
        <fieldset key={i} className="rounded-md border border-slate-200 p-3" aria-label={`Test ${i + 1}`}>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-slate-800">Test {i + 1}</span>
            {t.isSample ? <Badge tone="blue">Sample</Badge> : <Badge>Hidden</Badge>}
            <label className="flex items-center gap-1.5 text-slate-700">
              <input
                type="checkbox"
                checked={t.isSample}
                disabled={disabled}
                onChange={(e) => update(i, { isSample: e.target.checked })}
              />
              Show as example
            </label>
            <label className="flex items-center gap-1.5 text-slate-700">
              Weight
              <Input
                type="number"
                min={1}
                max={100}
                className="w-20 py-1"
                value={t.weight ?? 1}
                disabled={disabled}
                onChange={(e) => update(i, { weight: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
              />
            </label>
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </Button>
              <Button size="sm" variant="ghost" disabled={disabled || i === tests.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled || tests.length <= 1}
                onClick={() => onChange(tests.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Textarea
              aria-label={`Test ${i + 1} input`}
              placeholder="Input (stdin)"
              rows={3}
              className="text-xs"
              value={t.input}
              disabled={disabled}
              onChange={(e) => update(i, { input: e.target.value })}
            />
            <Textarea
              aria-label={`Test ${i + 1} expected output`}
              placeholder="Expected output"
              rows={3}
              className="text-xs"
              value={t.expectedOutput}
              disabled={disabled}
              onChange={(e) => update(i, { expectedOutput: e.target.value })}
            />
          </div>
        </fieldset>
      ))}
    </div>
  );
}
