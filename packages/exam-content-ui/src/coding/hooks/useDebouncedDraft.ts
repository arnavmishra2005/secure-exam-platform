/**
 * Owner: Person B.
 *
 * Saves `value` through `save` once it has been unchanged for `delayMs`,
 * and flushes a pending change when the component unmounts (e.g. the
 * student moves to another question). The initial value is never saved.
 * `save` is expected to be the host's offline-safe saveAnswer().
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type DraftStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useDebouncedDraft(
  value: string,
  save: (value: string) => void | Promise<void>,
  delayMs = 1500,
): { status: DraftStatus; flush: () => void } {
  const [status, setStatus] = useState<DraftStatus>('idle');
  /** Last value handed to `save`; null after a failed save so the next change retries. */
  const lastSaved = useRef<string | null>(value);
  const latest = useRef(value);
  const saveRef = useRef(save);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  saveRef.current = save;
  latest.current = value;

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const v = latest.current;
    if (v === lastSaved.current) return;
    lastSaved.current = v;
    setStatus('saving');
    const onFail = () => {
      lastSaved.current = null; // let the next change retry
      setStatus('error');
    };
    // Call synchronously so a flush on unmount reaches the host immediately.
    let result: void | Promise<void>;
    try {
      result = saveRef.current(v);
    } catch {
      onFail();
      return;
    }
    Promise.resolve(result).then(() => setStatus((s) => (s === 'saving' ? 'saved' : s)), onFail);
  }, []);

  useEffect(() => {
    if (value === lastSaved.current) return;
    setStatus('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delayMs);
  }, [value, delayMs, flush]);

  useEffect(() => () => flush(), [flush]);

  return { status, flush };
}
