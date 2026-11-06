/**
 * The classifier lives in @secure-exam/types (packages/types/src/error-classifier.ts)
 * so the exam UI can classify desktop-runner results too. Fixtures are real
 * Python 3.12 output.
 */
import {
  classifyError,
  classifyOutcome,
  CodeErrorKind,
  CodeLanguage,
  ExecutionOutcome,
  ExecutionStatus,
} from '@secure-exam/types';

const py = (stderr: string, exitCode: number | null = 1) => classifyError(CodeLanguage.PYTHON, stderr, exitCode);

const outcome = (stderr: string, status = ExecutionStatus.RUNTIME_ERROR, exitCode: number | null = 1): ExecutionOutcome => ({
  status,
  stdout: '',
  stderr,
  exitCode,
  timeMs: 12,
});

const SYNTAX = `  File "/tmp/main.py", line 3
    x = (1,
        ^
SyntaxError: '(' was never closed
`;

const INDENTATION = `  File "/sandbox/main.py", line 2
    print(1)
    ^^^^^
IndentationError: expected an indented block after 'if' statement on line 1
`;

const TAB = `  File "/tmp/main.py", line 3
    b = 2
TabError: inconsistent use of tabs and spaces in indentation
`;

const NAME = `Traceback (most recent call last):
  File "/tmp/main.py", line 4, in <module>
    g()
  File "/tmp/main.py", line 2, in g
    return x
           ^
NameError: name 'x' is not defined
`;

const EVAL_SYNTAX = `Traceback (most recent call last):
  File "/tmp/main.py", line 1, in <module>
    eval("1+")
  File "<string>", line 1
    1+
      ^
SyntaxError: invalid syntax
`;

const FROM_LIBRARY = `Traceback (most recent call last):
  File "/tmp/main.py", line 5, in <module>
    print(sorted(items, key=k))
          ^^^^^^^^^^^^^^^^^^^^
  File "/tmp/main.py", line 2, in k
    return int(s)
           ^^^^^^
ValueError: invalid literal for int() with base 10: 'abc'
`;

describe('classifyError (Python)', () => {
  it.each([
    ['ZeroDivisionError: division by zero', CodeErrorKind.ZERO_DIVISION],
    ['IndexError: list index out of range', CodeErrorKind.INDEX],
    ["KeyError: 'a'", CodeErrorKind.KEY],
    ["TypeError: can only concatenate str (not \"int\") to str", CodeErrorKind.TYPE],
    ["AttributeError: 'list' object has no attribute 'push'", CodeErrorKind.ATTRIBUTE],
    ['EOFError: EOF when reading a line', CodeErrorKind.EOF],
    ["ModuleNotFoundError: No module named 'numpy'", CodeErrorKind.IMPORT],
    ["UnboundLocalError: cannot access local variable 'n' where it is not associated with a value", CodeErrorKind.NAME],
    ['RecursionError: maximum recursion depth exceeded', CodeErrorKind.STACK_OVERFLOW],
    ['json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)', CodeErrorKind.OTHER],
    ['RuntimeError: boom', CodeErrorKind.OTHER],
  ])('maps %s', (last, kind) => {
    const stderr = `Traceback (most recent call last):\n  File "/tmp/main.py", line 7, in <module>\n    f()\n${last}\n`;
    expect(py(stderr)).toEqual({ kind, line: 7, message: last });
  });

  it('reads a syntax error and its line', () => {
    expect(py(SYNTAX)).toEqual({ kind: CodeErrorKind.SYNTAX, line: 3, message: "SyntaxError: '(' was never closed" });
  });

  it('treats IndentationError and TabError as indentation errors', () => {
    expect(py(INDENTATION)).toMatchObject({ kind: CodeErrorKind.INDENTATION, line: 2 });
    expect(py(TAB)).toMatchObject({ kind: CodeErrorKind.INDENTATION, line: 3 });
  });

  it("reports the deepest line in the student's file", () => {
    expect(py(NAME)).toMatchObject({ kind: CodeErrorKind.NAME, line: 2 });
    expect(py(FROM_LIBRARY)).toMatchObject({ kind: CodeErrorKind.VALUE, line: 2 });
  });

  it("ignores frames outside the student's file", () => {
    expect(py(EVAL_SYNTAX)).toMatchObject({ kind: CodeErrorKind.SYNTAX, line: 1 });
  });

  it('copes with Windows line endings and trailing blank lines', () => {
    expect(py(NAME.replace(/\n/g, '\r\n') + '\r\n\r\n')).toMatchObject({ kind: CodeErrorKind.NAME, line: 2 });
  });

  it('reads crash signals from a negative exit code or 128 + signal', () => {
    expect(py('', -11)).toEqual({ kind: CodeErrorKind.SEGFAULT, line: null, message: 'Segmentation fault (signal 11)' });
    expect(py('', -6)).toMatchObject({ kind: CodeErrorKind.ABORT });
    expect(py('', 139)).toMatchObject({ kind: CodeErrorKind.SEGFAULT });
    // SIGSYS: the sandbox's seccomp filter killed the program (#19).
    expect(py('', -31)).toMatchObject({ kind: CodeErrorKind.BLOCKED_SYSCALL, line: null });
    expect(py('', 159)).toMatchObject({ kind: CodeErrorKind.BLOCKED_SYSCALL });
    expect(py('', 134)).toMatchObject({ kind: CodeErrorKind.ABORT });
  });

  it('does not read a Python exit code above 128 as a signal when there is a traceback', () => {
    expect(py(NAME, 139)).toMatchObject({ kind: CodeErrorKind.NAME });
  });

  it('reports a plain non-zero exit as OTHER', () => {
    expect(py('', 3)).toEqual({ kind: CodeErrorKind.OTHER, line: null, message: 'Exited with code 3' });
    // sys.exit("bye") prints the message without a traceback.
    expect(py('bye\n', 1)).toEqual({ kind: CodeErrorKind.OTHER, line: null, message: 'Exited with code 1' });
  });
});

describe('classifyOutcome', () => {
  it('leaves OK, limit and runner errors untouched', () => {
    for (const status of [
      ExecutionStatus.OK,
      ExecutionStatus.TIME_LIMIT_EXCEEDED,
      ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
      ExecutionStatus.OUTPUT_LIMIT_EXCEEDED,
      ExecutionStatus.INTERNAL_ERROR,
    ]) {
      const o = outcome('Traceback (most recent call last):\nValueError: x\n', status);
      expect(classifyOutcome(o, CodeLanguage.PYTHON)).toBe(o);
    }
  });

  it('adds the error to a runtime error', () => {
    const r = classifyOutcome(outcome(NAME), CodeLanguage.PYTHON);
    expect(r.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(r.error).toMatchObject({ kind: CodeErrorKind.NAME, line: 2 });
    expect(r.stderr).toBe(NAME);
  });

  it('turns a syntax error in the student file into a compilation error (desktop runner)', () => {
    expect(classifyOutcome(outcome(SYNTAX), CodeLanguage.PYTHON)).toMatchObject({
      status: ExecutionStatus.COMPILATION_ERROR,
      error: { kind: CodeErrorKind.SYNTAX, line: 3 },
    });
    expect(classifyOutcome(outcome(INDENTATION), CodeLanguage.PYTHON).status).toBe(ExecutionStatus.COMPILATION_ERROR);
  });

  it('keeps a SyntaxError raised by eval() a runtime error', () => {
    expect(classifyOutcome(outcome(EVAL_SYNTAX), CodeLanguage.PYTHON).status).toBe(ExecutionStatus.RUNTIME_ERROR);
  });

  it('classifies a compilation error from the server compile step', () => {
    const r = classifyOutcome(outcome(TAB, ExecutionStatus.COMPILATION_ERROR), CodeLanguage.PYTHON);
    expect(r).toMatchObject({ status: ExecutionStatus.COMPILATION_ERROR, error: { kind: CodeErrorKind.INDENTATION, line: 3 } });
  });

  it('gives the same result when applied twice', () => {
    const once = classifyOutcome(outcome(SYNTAX), CodeLanguage.PYTHON);
    expect(classifyOutcome(once, CodeLanguage.PYTHON)).toEqual(once);
  });
});
