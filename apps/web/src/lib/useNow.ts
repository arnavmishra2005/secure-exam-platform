import { useEffect, useState } from 'react';

/**
 * The current time, updated every `intervalMs`, so countdowns such as
 * "Starts in 4m 32s" keep running between data refreshes.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
