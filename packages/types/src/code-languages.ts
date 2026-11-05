/**
 * Owner: Person B (#16). What the UI and API agree on per language: display
 * name, Monaco mode, the file the code is saved as, and default starter code.
 * Compile/run commands live in the API (execution/language.registry.ts).
 *
 * Programs read standard input and write standard output, like HackerRank
 * and Codeforces. Java code must be in `public class Main`.
 */
import { CodeLanguage } from './coding.types';

export interface CodeLanguageInfo {
  /** Shown in the editor's language picker, e.g. "C++ 17 (g++)". */
  label: string;
  /** Short name, e.g. "C++". */
  shortLabel: string;
  /** Monaco language id. */
  monacoId: string;
  /** Source file name in the sandbox (Java needs Main.java for class Main). */
  fileName: string;
  /** Compiled before the tests run (compile errors stop every test). */
  compiled: boolean;
  /** Starter code when the question doesn't set one. */
  defaultStarter: string;
}

export const CODE_LANGUAGES: Record<CodeLanguage, CodeLanguageInfo> = {
  [CodeLanguage.PYTHON]: {
    label: 'Python 3.12',
    shortLabel: 'Python',
    monacoId: 'python',
    fileName: 'main.py',
    compiled: false,
    defaultStarter: '# Read input with input() and print your answer.\n',
  },
  [CodeLanguage.C]: {
    label: 'C 17 (gcc)',
    shortLabel: 'C',
    monacoId: 'c',
    fileName: 'main.c',
    compiled: true,
    defaultStarter: [
      '#include <stdio.h>',
      '',
      'int main(void) {',
      '    // Read input with scanf() and print your answer with printf().',
      '    return 0;',
      '}',
      '',
    ].join('\n'),
  },
  [CodeLanguage.CPP]: {
    label: 'C++ 17 (g++)',
    shortLabel: 'C++',
    monacoId: 'cpp',
    fileName: 'main.cpp',
    compiled: true,
    defaultStarter: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      '',
      'int main() {',
      '    ios::sync_with_stdio(false);',
      '    cin.tie(nullptr);',
      '    // Read input with cin and print your answer with cout.',
      '    return 0;',
      '}',
      '',
    ].join('\n'),
  },
  [CodeLanguage.JAVA]: {
    label: 'Java 21',
    shortLabel: 'Java',
    monacoId: 'java',
    fileName: 'Main.java',
    compiled: true,
    defaultStarter: [
      'import java.io.*;',
      'import java.util.*;',
      '',
      'public class Main {',
      '    public static void main(String[] args) throws IOException {',
      '        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));',
      '        // Read input with in.readLine() and print your answer with System.out.println().',
      '    }',
      '}',
      '',
    ].join('\n'),
  },
};

/** Display order in pickers. */
export const CODE_LANGUAGE_ORDER: readonly CodeLanguage[] = [CodeLanguage.PYTHON, CodeLanguage.C, CodeLanguage.CPP, CodeLanguage.JAVA];

export function isCodeLanguage(value: unknown): value is CodeLanguage {
  return typeof value === 'string' && (Object.values(CodeLanguage) as string[]).includes(value);
}

/** Starter code for a language: the question's own, else the default. */
export function starterFor(starterCode: Partial<Record<CodeLanguage, string>> | undefined, language: CodeLanguage): string {
  const own = starterCode?.[language];
  return own !== undefined && own !== '' ? own : CODE_LANGUAGES[language].defaultStarter;
}

/**
 * The language a student starts in: Python when allowed (the platform's
 * default), else the first allowed language.
 */
export function defaultLanguage(allowed: readonly CodeLanguage[] | undefined): CodeLanguage {
  if (!allowed || allowed.length === 0 || allowed.includes(CodeLanguage.PYTHON)) return CodeLanguage.PYTHON;
  return allowed[0];
}

// ---- Saved drafts ----
//
// A coding answer's draft is saved as the answer's textResponse (so it syncs
// offline with every other answer). The language travels with it as a first
// line `\u0001lang:<language>`; a draft without that line is Python, which is
// how every draft was saved before #16. The control character can't be typed
// in the editor, so student code can't fake the header.

const DRAFT_HEADER = '\u0001lang:';

/** The textResponse to save for `code` in `language`. Empty code stays empty (no answer). */
export function encodeCodeDraft(language: CodeLanguage, code: string): string {
  if (code === '' || language === CodeLanguage.PYTHON) return code;
  return `${DRAFT_HEADER}${language}\n${code}`;
}

/** Reads a saved draft. `language` is null for an empty draft. */
export function decodeCodeDraft(text: string | null | undefined): { language: CodeLanguage | null; code: string } {
  if (!text) return { language: null, code: '' };
  if (!text.startsWith(DRAFT_HEADER)) return { language: CodeLanguage.PYTHON, code: text };
  const newline = text.indexOf('\n');
  const name = text.slice(DRAFT_HEADER.length, newline === -1 ? undefined : newline);
  const code = newline === -1 ? '' : text.slice(newline + 1);
  return { language: isCodeLanguage(name) ? name : null, code };
}
