import {
  classifyOutcome,
  CODE_LANGUAGE_ORDER,
  CODE_LANGUAGES,
  CodeErrorKind,
  CodeLanguage,
  decodeCodeDraft,
  defaultLanguage,
  encodeCodeDraft,
  ExecutionStatus,
  starterFor,
  type ExecutionOutcome,
} from '@secure-exam/types';
import { LANGUAGE_REGISTRY, resolveCommand } from './language.registry';

/** #16: the language catalogue, saved drafts, and C/C++/Java error labels (real containers: docker-runner.provider.docker.spec.ts). */

describe('code drafts carry their language', () => {
  it('saves Python as plain text, so drafts from before #16 still read as Python', () => {
    expect(encodeCodeDraft(CodeLanguage.PYTHON, 'print(1)')).toBe('print(1)');
    expect(decodeCodeDraft('print(1)')).toEqual({ language: CodeLanguage.PYTHON, code: 'print(1)' });
  });

  it.each([CodeLanguage.C, CodeLanguage.CPP, CodeLanguage.JAVA])('round-trips %s code, newlines included', (language) => {
    const code = 'int main(){\n  return 0;\n}\n';
    const saved = encodeCodeDraft(language, code);
    expect(saved.length).toBeLessThanOrEqual(code.length + 32);
    expect(decodeCodeDraft(saved)).toEqual({ language, code });
  });

  it('keeps an empty draft empty (no answer) and tolerates broken headers', () => {
    expect(encodeCodeDraft(CodeLanguage.CPP, '')).toBe('');
    expect(decodeCodeDraft('')).toEqual({ language: null, code: '' });
    expect(decodeCodeDraft(null)).toEqual({ language: null, code: '' });
    expect(decodeCodeDraft('\u0001lang:cobol\nX')).toEqual({ language: null, code: 'X' });
    expect(decodeCodeDraft('\u0001lang:cpp')).toEqual({ language: CodeLanguage.CPP, code: '' });
  });

  it('starts students in Python when allowed, else the first allowed language', () => {
    expect(defaultLanguage([CodeLanguage.CPP, CodeLanguage.PYTHON])).toBe(CodeLanguage.PYTHON);
    expect(defaultLanguage([CodeLanguage.JAVA, CodeLanguage.C])).toBe(CodeLanguage.JAVA);
    expect(defaultLanguage([])).toBe(CodeLanguage.PYTHON);
  });

  it("uses the question's starter code, else the language's default", () => {
    expect(starterFor({ [CodeLanguage.C]: 'mine' }, CodeLanguage.C)).toBe('mine');
    expect(starterFor({ [CodeLanguage.C]: '' }, CodeLanguage.C)).toBe(CODE_LANGUAGES[CodeLanguage.C].defaultStarter);
    expect(CODE_LANGUAGES[CodeLanguage.JAVA].defaultStarter).toContain('public class Main');
  });
});

describe('language registry', () => {
  it('has an entry, a catalogue entry and a picker position for every language', () => {
    for (const language of Object.values(CodeLanguage)) {
      expect(LANGUAGE_REGISTRY[language].language).toBe(language);
      expect(LANGUAGE_REGISTRY[language].sourcePath.endsWith(CODE_LANGUAGES[language].fileName)).toBe(true);
      expect(CODE_LANGUAGE_ORDER).toContain(language);
    }
  });

  it('marks compiled languages as needing gVisor and an executable /tmp', () => {
    for (const language of [CodeLanguage.C, CodeLanguage.CPP, CodeLanguage.JAVA]) {
      expect(LANGUAGE_REGISTRY[language].sandbox).toMatchObject({ requiresIsolatedRuntime: true, tmpfsExec: true });
    }
    expect(LANGUAGE_REGISTRY[CodeLanguage.PYTHON].sandbox).toBeUndefined();
  });

  it("gives the JVM the question's memory limit as its heap", () => {
    expect(resolveCommand(LANGUAGE_REGISTRY[CodeLanguage.JAVA].runCommand, { memoryLimitMb: 256 })).toContain('-Xmx256m');
  });
});

describe('C, C++ and Java errors', () => {
  const out = (stderr: string, exitCode: number | null, status = ExecutionStatus.RUNTIME_ERROR): ExecutionOutcome => ({
    status,
    stdout: '',
    stderr,
    exitCode,
    timeMs: 1,
  });

  it('reads a gcc error with its line', () => {
    const r = classifyOutcome(
      out("/tmp/main.c: In function 'main':\n/tmp/main.c:3:11: error: 'y' undeclared (first use in this function)\n", 1, ExecutionStatus.COMPILATION_ERROR),
      CodeLanguage.C,
    );
    expect(r.error).toEqual({ kind: CodeErrorKind.COMPILE, line: 3, message: "main.c:3: error: 'y' undeclared (first use in this function)" });
  });

  it('reads a javac error with its line', () => {
    const r = classifyOutcome(out("/tmp/Main.java:5: error: ';' expected\n        int x = 1\n                 ^\n1 error\n", 1, ExecutionStatus.COMPILATION_ERROR), CodeLanguage.JAVA);
    expect(r.error).toMatchObject({ kind: CodeErrorKind.COMPILE, line: 5 });
  });

  it('reads a linker error without a line', () => {
    const r = classifyOutcome(
      out("/usr/bin/ld: /tmp/cc.o: in function `main':\nmain.c:(.text+0x5): undefined reference to `solve'\ncollect2: error: ld returned 1 exit status\n", 1, ExecutionStatus.COMPILATION_ERROR),
      CodeLanguage.C,
    );
    expect(r.error).toMatchObject({ kind: CodeErrorKind.COMPILE, line: null });
    expect(r.error?.message).toContain("undefined reference to `solve'");
  });

  it('maps Java exceptions and the line in Main.java', () => {
    const stderr = 'Exception in thread "main" java.lang.NullPointerException: Cannot read field "x"\n\tat Main.solve(Main.java:9)\n\tat Main.main(Main.java:4)\n';
    expect(classifyOutcome(out(stderr, 1), CodeLanguage.JAVA).error).toEqual({
      kind: CodeErrorKind.NULL_POINTER,
      line: 9,
      message: 'NullPointerException: Cannot read field "x"',
    });
    const div = 'Exception in thread "main" java.lang.ArithmeticException: / by zero\n\tat Main.main(Main.java:3)\n';
    expect(classifyOutcome(out(div, 1), CodeLanguage.JAVA).error).toMatchObject({ kind: CodeErrorKind.ZERO_DIVISION, line: 3 });
    const eof = 'Exception in thread "main" java.util.NoSuchElementException\n\tat java.base/java.util.Scanner.throwFor(Scanner.java:945)\n\tat Main.main(Main.java:6)\n';
    expect(classifyOutcome(out(eof, 1), CodeLanguage.JAVA).error).toMatchObject({ kind: CodeErrorKind.EOF, line: 6 });
  });

  it('names an uncaught C++ exception, and reads crash signals', () => {
    const cpp = "terminate called after throwing an instance of 'std::out_of_range'\n  what():  vector::_M_range_check: __n (which is 10) >= this->size() (which is 3)\n";
    expect(classifyOutcome(out(cpp, -6), CodeLanguage.CPP).error).toMatchObject({ kind: CodeErrorKind.INDEX });
    expect(classifyOutcome(out('', -11), CodeLanguage.C).error).toMatchObject({ kind: CodeErrorKind.SEGFAULT });
    expect(classifyOutcome(out('', -8), CodeLanguage.CPP).error).toMatchObject({ kind: CodeErrorKind.ZERO_DIVISION });
    expect(classifyOutcome(out('', 159), CodeLanguage.C).error).toMatchObject({ kind: CodeErrorKind.BLOCKED_SYSCALL });
    expect(classifyOutcome(out('', 3), CodeLanguage.C).error).toEqual({ kind: CodeErrorKind.OTHER, line: null, message: 'Exited with code 3' });
  });

  it('never turns a compiled-language runtime error into a compilation error', () => {
    expect(classifyOutcome(out('main.c:1:1: error: x', 1), CodeLanguage.C).status).toBe(ExecutionStatus.RUNTIME_ERROR);
  });
});
