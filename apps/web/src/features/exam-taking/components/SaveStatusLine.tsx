// The exam page's "are my answers on the server?" line.
//
// It is always one line of the same height, so it never pushes the question
// (or the code editor) up and down while answers save. Answers are saved
// continuously while a student types, so a short "Saving…" is normal; the
// amber warning only appears when something has stayed unsaved for a while
// (offline, or the server is slow).

import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** How long answers may stay unsaved before the line turns into a warning. */
export const SAVE_WARNING_DELAY_MS = 3000;

export function SaveStatusLine({ unsavedCount, warnAfterMs = SAVE_WARNING_DELAY_MS }: { unsavedCount: number; warnAfterMs?: number }) {
  const pending = unsavedCount > 0;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), warnAfterMs);
    return () => clearTimeout(timer);
  }, [pending, warnAfterMs]);

  const message = !pending
    ? 'All changes saved to the server.'
    : slow
      ? `${unsavedCount} unsaved answer(s). Keep this device open until all changes reach the server.`
      : 'Saving…';
  const Icon = !pending ? CheckCircle2 : slow ? AlertTriangle : Loader2;

  return (
    <p
      className={cn(
        'flex h-6 min-w-0 items-center gap-1.5 text-sm',
        slow && pending ? 'font-medium text-[hsl(38_60%_28%)] dark:text-warning' : 'text-muted-foreground',
      )}
      title={message}
    >
      <Icon className={cn('h-4 w-4 shrink-0', pending && !slow && 'animate-spin')} aria-hidden="true" />
      <span className="truncate">{message}</span>
    </p>
  );
}
