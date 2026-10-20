/**
 * Owner: Person B (Code Runner)
 *
 * CONTRACT (Day 1 morning). One entry per supported language. The image is
 * pre-pulled on the runner host and pinned by tag; RUNNER_PYTHON_IMAGE
 * overrides it.
 */

import type { CodeLanguage } from '@secure-exam/types';

export interface LanguageDefinition {
  id: CodeLanguage;
  displayName: string;
  /** Monaco language id for the editor. */
  editorLanguage: string;
  /** Container image the runner executes the code in. */
  image: string;
  /** File the source is written to inside the container. */
  sourceFile: string;
  /** Command run inside the container; the source file is read-only. */
  runCommand: string[];
  defaultTimeLimitMs: number;
  defaultMemoryLimitMb: number;
}

export const LANGUAGE_REGISTRY: Record<CodeLanguage, LanguageDefinition> = {
  python: {
    id: 'python',
    displayName: 'Python 3',
    editorLanguage: 'python',
    image: process.env.RUNNER_PYTHON_IMAGE ?? 'python:3.12-slim',
    sourceFile: 'main.py',
    runCommand: ['python3', '-I', '-B', '/code/main.py'],
    defaultTimeLimitMs: 2000,
    defaultMemoryLimitMb: 128,
  },
};

export function getLanguage(id: CodeLanguage): LanguageDefinition {
  return LANGUAGE_REGISTRY[id];
}
