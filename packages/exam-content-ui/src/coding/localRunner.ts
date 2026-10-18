/**
 * Owner: Person B. Finding the local runner Person C's Electron app exposes.
 * Contract: LocalRunner in @secure-exam/types; spec in docs/local-code-runner.md.
 */
import type { LocalRunner } from '@secure-exam/types';

declare global {
  interface Window {
    desktop?: { runCode?: LocalRunner['run'] };
  }
}

/** The Electron app's runner, or undefined in a plain browser. */
export function desktopLocalRunner(): LocalRunner | undefined {
  const run = typeof window !== 'undefined' ? window.desktop?.runCode : undefined;
  return run ? { run: (job) => run(job) } : undefined;
}

/** Same per-stream cap the server uses (RUNNER_OUTPUT_LIMIT_BYTES default). */
export const LOCAL_OUTPUT_LIMIT_BYTES = 65_536;
