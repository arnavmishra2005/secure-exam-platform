/**
 * Owner: Person B.
 *
 * Everything language-specific lives here. Adding a language = one entry
 * here + an image that contains python3 (the in-container harness is Python).
 */

import { CodeLanguage } from '@secure-exam/types';

export interface LanguageSpec {
  language: CodeLanguage;
  displayName: string;
  /** Monaco editor language id. */
  monacoId: string;
  /** Env var that overrides the Docker image (pin by digest in production). */
  imageEnvKey: string;
  defaultImage: string;
  /** File the student's code is written to inside the sandbox. */
  sourcePath: string;
  /** Command the harness runs once per test input. */
  runCommand: string[];
  defaultStarterCode: string;
}

export const LANGUAGE_REGISTRY: Record<CodeLanguage, LanguageSpec> = {
  [CodeLanguage.PYTHON]: {
    language: CodeLanguage.PYTHON,
    displayName: 'Python 3.12',
    monacoId: 'python',
    imageEnvKey: 'RUNNER_PYTHON_IMAGE',
    defaultImage: 'python:3.12-slim',
    sourcePath: '/tmp/main.py',
    // -I: isolated mode (ignores PYTHON* env vars and user site-packages); -B: no .pyc files.
    runCommand: ['python3', '-I', '-B', '/tmp/main.py'],
    defaultStarterCode: '# Read input with input() and print your answer.\n',
  },
};

export function getLanguageSpec(language: CodeLanguage): LanguageSpec {
  const spec = LANGUAGE_REGISTRY[language];
  if (!spec) throw new Error(`Unsupported language: ${language}`);
  return spec;
}
