// Owner: Person C (ported from the legacy exam client).
// Pre-exam readiness checks. In a browser it passes straight through; in the
// exam app the parent keeps Start disabled until every check passes.

import type { DesktopReadiness } from '@secure-exam/types';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { desktop, isDesktop } from './desktop';

export function ReadinessGate({ onReady }: { onReady: (ready: boolean) => void }) {
  const [result, setResult] = useState<DesktopReadiness | null>(null);
  const [checking, setChecking] = useState(isDesktop());

  const runChecks = useCallback(async () => {
    setChecking(true);
    onReady(false);
    try {
      const r = await desktop.getReadiness();
      setResult(r);
      onReady(Boolean(r?.ok));
    } catch {
      setResult(null);
    } finally {
      setChecking(false);
    }
  }, [onReady]);

  useEffect(() => {
    if (!isDesktop()) {
      onReady(true);
      return;
    }
    void runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isDesktop()) return null;
  if (checking) return <p className="text-sm text-muted-foreground">Running readiness checks…</p>;

  const forbidden = result?.checks.forbiddenList?.length ? ` (${result.checks.forbiddenList.join(', ')})` : '';
  const items = result
    ? [
        { label: 'Single display', ok: result.checks.singleDisplay },
        { label: 'Exam server reachable', ok: result.checks.backendReachable },
        { label: `No forbidden applications${forbidden}`, ok: result.checks.noForbiddenProcesses },
      ]
    : [{ label: 'Readiness checks could not run', ok: false }];

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Readiness checks</p>
      {items.map(({ label, ok }) => (
        <div key={label} className="flex items-center gap-2 text-sm">
          {ok ? (
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
          )}
          <span className={ok ? '' : 'text-destructive'}>{label}</span>
        </div>
      ))}
      {!result?.ok && (
        <Button type="button" variant="outline" size="sm" onClick={() => void runChecks()}>
          Re-check
        </Button>
      )}
    </div>
  );
}
