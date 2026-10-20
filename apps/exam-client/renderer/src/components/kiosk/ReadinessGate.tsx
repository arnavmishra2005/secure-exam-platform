/**
 * Pre-exam readiness gate — shown in InstructionsPage when running in Electron.
 * Blocks Start Exam if any check fails.
 */
import { useState, useEffect } from 'react';
import { desktop, isDesktop } from '../../hooks/useDesktop';
import type { ReadinessResult } from '../../hooks/useDesktop';

export function ReadinessGate({ onReady }: { onReady: () => void }) {
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [checking, setChecking] = useState(true);

  async function runChecks() {
    setChecking(true);
    const r = await desktop.getReadiness();
    setResult(r);
    setChecking(false);
    if (r?.ok) onReady();
  }

  useEffect(() => {
    if (!isDesktop()) { onReady(); return; }
    runChecks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isDesktop()) return null;
  if (checking) return <p className="text-sm text-gray-500 mt-2">Running readiness checks…</p>;
  if (!result) return null;

  const forbiddenNames =
    result.checks.forbiddenList && result.checks.forbiddenList.length > 0
      ? ` (${result.checks.forbiddenList.join(', ')})`
      : '';

  const items = [
    { label: 'Single display', ok: result.checks.singleDisplay },
    { label: 'Exam server reachable', ok: result.checks.backendReachable },
    { label: `No forbidden applications${forbiddenNames}`, ok: result.checks.noForbiddenProcesses },
  ];

  return (
    <div className="mt-3 rounded-lg border border-gray-200 px-4 py-3 space-y-2 bg-gray-50">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Readiness Checks</p>
      {items.map(({ label, ok }) => (
        <div key={label} className="flex items-center gap-2 text-sm">
          <span className={ok ? 'text-green-600' : 'text-red-600'}>{ok ? '✓' : '✗'}</span>
          <span className={ok ? 'text-gray-700' : 'text-red-700'}>{label}</span>
        </div>
      ))}
      {!result.ok && (
        <button
          onClick={runChecks}
          className="mt-1 text-xs text-blue-600 underline hover:text-blue-800"
        >
          Re-check
        </button>
      )}
    </div>
  );
}

