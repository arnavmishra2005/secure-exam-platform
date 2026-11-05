/**
 * Owner: Person B. Turns a failed run's stderr and exit code into a
 * `CodeErrorInfo` (kind, line, one-line message). Pure functions, shared by
 * the server grader (DockerRunnerProvider) and the exam UI (results from the
 * desktop runner), so both label errors the same way.
 */

import {
  CodeErrorInfo,
  CodeErrorKind,
  CodeLanguage,
  ExecutionOutcome,
  ExecutionStatus,
} from './coding.types';

const PYTHON_EXCEPTION_KINDS: Record<string, CodeErrorKind> = {
  SyntaxError: CodeErrorKind.SYNTAX,
  IndentationError: CodeErrorKind.INDENTATION,
  TabError: CodeErrorKind.INDENTATION,
  NameError: CodeErrorKind.NAME,
  UnboundLocalError: CodeErrorKind.NAME,
  TypeError: CodeErrorKind.TYPE,
  ValueError: CodeErrorKind.VALUE,
  IndexError: CodeErrorKind.INDEX,
  KeyError: CodeErrorKind.KEY,
  AttributeError: CodeErrorKind.ATTRIBUTE,
  ZeroDivisionError: CodeErrorKind.ZERO_DIVISION,
  EOFError: CodeErrorKind.EOF,
  ImportError: CodeErrorKind.IMPORT,
  ModuleNotFoundError: CodeErrorKind.IMPORT,
  RecursionError: CodeErrorKind.STACK_OVERFLOW,
};

const COMPILE_KINDS = new Set([CodeErrorKind.SYNTAX, CodeErrorKind.INDENTATION]);

const SIGNAL_KINDS: Record<number, { kind: CodeErrorKind; message: string }> = {
  6: { kind: CodeErrorKind.ABORT, message: 'Aborted (signal 6)' },
  8: { kind: CodeErrorKind.ZERO_DIVISION, message: 'Floating-point error (signal 8)' },
  11: { kind: CodeErrorKind.SEGFAULT, message: 'Segmentation fault (signal 11)' },
  31: { kind: CodeErrorKind.BLOCKED_SYSCALL, message: 'Stopped by the sandbox: a blocked system call (signal 31)' },
};

/** A frame in the student's own file (`/tmp/main.py` on the server, `/sandbox/main.py` on the desktop). */
const STUDENT_FRAME = /^\s*File "(?:[^"]*\/)?main\.py", line (\d+)/;
const PYTHON_TRACEBACK = /^Traceback \(most recent call last\):/m;

/**
 * The signal that killed the program, if any. Python's subprocess reports it
 * as a negative exit code; a shell or sandbox wrapper as 128 + signal.
 */
function signalOf(exitCode: number | null, hasTraceback: boolean): number | null {
  if (exitCode === null) return null;
  if (exitCode < 0) return -exitCode;
  if (!hasTraceback && exitCode > 128 && SIGNAL_KINDS[exitCode - 128]) return exitCode - 128;
  return null;
}

function classifyPython(stderr: string, exitCode: number | null): CodeErrorInfo | null {
  const lines = stderr.replace(/\r\n?/g, '\n').split('\n');
  const last = [...lines].reverse().find((l) => l.trim() !== '')?.trim() ?? '';
  // "NameError: name 'x' is not defined", "json.decoder.JSONDecodeError: ...", or a bare "KeyboardInterrupt".
  const match = /^([A-Za-z_][\w.]*)(?::|$)/.exec(last);
  // A runtime error starts with "Traceback (most recent call last):"; a
  // syntax error has only the `File "…", line N` part. Anything else (e.g.
  // sys.exit("message")) isn't a Python exception report.
  const isReport = match !== null && (PYTHON_TRACEBACK.test(stderr) || /^\s*File "[^"]*", line \d+/m.test(stderr));
  const exception = isReport ? match![1].split('.').pop()! : null;

  const signal = signalOf(exitCode, isReport);
  if (signal !== null && SIGNAL_KINDS[signal]) {
    const { kind, message } = SIGNAL_KINDS[signal];
    return { kind, line: null, message };
  }
  if (exception === null) {
    return { kind: CodeErrorKind.OTHER, line: null, message: exitCode !== null ? `Exited with code ${exitCode}` : last };
  }

  // The deepest frame in the student's file is where the error happened.
  let line: number | null = null;
  for (const l of lines) {
    const frame = STUDENT_FRAME.exec(l);
    if (frame) line = Number(frame[1]);
  }
  return { kind: PYTHON_EXCEPTION_KINDS[exception] ?? CodeErrorKind.OTHER, line, message: last };
}

// ---- C, C++ and Java (#16) ----

/** `…/main.c:5:9: error: …`, `main.cpp:3: fatal error: …`, `/tmp/Main.java:7: error: …` */
const COMPILER_ERROR = /^(?:[^\s:]*\/)?((?:main\.(?:c|cpp))|(?:\w+\.java)):(\d+):(?:\d+:)?\s*(?:fatal )?error:\s*(.*)$/m;
/** Linker or driver errors without a line: `undefined reference to 'f'`, `collect2: error: …`. */
const OTHER_COMPILE_ERROR = /^.*(?:undefined reference to .*|error:.*)$/m;

function classifyCompile(stderr: string): CodeErrorInfo {
  const text = stderr.replace(/\r\n?/g, '\n');
  const at = COMPILER_ERROR.exec(text);
  if (at) return { kind: CodeErrorKind.COMPILE, line: Number(at[2]), message: `${at[1]}:${at[2]}: error: ${at[3].trim()}` };
  const other = OTHER_COMPILE_ERROR.exec(text)?.[0].trim();
  const first = other ?? text.split('\n').find((l) => l.trim() !== '')?.trim() ?? 'Compilation failed';
  return { kind: CodeErrorKind.COMPILE, line: null, message: first.replace(/^(?:[^\s:]*\/)+/, '') };
}

const JAVA_EXCEPTION_KINDS: Record<string, CodeErrorKind> = {
  ArithmeticException: CodeErrorKind.ZERO_DIVISION,
  ArrayIndexOutOfBoundsException: CodeErrorKind.INDEX,
  StringIndexOutOfBoundsException: CodeErrorKind.INDEX,
  IndexOutOfBoundsException: CodeErrorKind.INDEX,
  NullPointerException: CodeErrorKind.NULL_POINTER,
  NumberFormatException: CodeErrorKind.VALUE,
  InputMismatchException: CodeErrorKind.VALUE,
  NegativeArraySizeException: CodeErrorKind.VALUE,
  IllegalArgumentException: CodeErrorKind.VALUE,
  // Scanner.next() with no input left.
  NoSuchElementException: CodeErrorKind.EOF,
  StackOverflowError: CodeErrorKind.STACK_OVERFLOW,
  ClassCastException: CodeErrorKind.TYPE,
};
const JAVA_UNCAUGHT = /^Exception in thread "[^"]*" ([\w.$]+)(?::\s*(.*))?$/m;
/** The top frame in the student's file: `at Main.solve(Main.java:12)`. */
const JAVA_FRAME = /\(Main\.java:(\d+)\)/;

function classifyJava(stderr: string, exitCode: number | null): CodeErrorInfo {
  const signal = signalOf(exitCode, false);
  if (signal !== null && SIGNAL_KINDS[signal]) return { kind: SIGNAL_KINDS[signal].kind, line: null, message: SIGNAL_KINDS[signal].message };
  const uncaught = JAVA_UNCAUGHT.exec(stderr);
  if (uncaught) {
    const name = uncaught[1].split('.').pop()!;
    const line = JAVA_FRAME.exec(stderr);
    return {
      kind: JAVA_EXCEPTION_KINDS[name] ?? CodeErrorKind.OTHER,
      line: line ? Number(line[1]) : null,
      message: uncaught[2] ? `${name}: ${uncaught[2].trim()}` : name,
    };
  }
  if (/Could not find or load main class Main|Main method not found in class Main/.test(stderr)) {
    return { kind: CodeErrorKind.OTHER, line: null, message: 'The program must be in `public class Main` with a `public static void main(String[] args)` method.' };
  }
  const last = [...stderr.split('\n')].reverse().find((l) => l.trim() !== '')?.trim();
  return { kind: CodeErrorKind.OTHER, line: null, message: last ?? (exitCode !== null ? `Exited with code ${exitCode}` : 'Runtime error') };
}

const CPP_EXCEPTION_KINDS: Record<string, CodeErrorKind> = {
  'std::out_of_range': CodeErrorKind.INDEX,
  'std::invalid_argument': CodeErrorKind.VALUE,
  'std::length_error': CodeErrorKind.VALUE,
};
const CPP_UNCAUGHT = /terminate called after throwing an instance of '([^']+)'(?:\s*what\(\):\s*(.*))?/;

function classifyNative(stderr: string, exitCode: number | null): CodeErrorInfo {
  const uncaught = CPP_UNCAUGHT.exec(stderr);
  if (uncaught) {
    return {
      kind: CPP_EXCEPTION_KINDS[uncaught[1]] ?? CodeErrorKind.ABORT,
      line: null,
      message: `Uncaught exception ${uncaught[1]}${uncaught[2] ? `: ${uncaught[2].trim()}` : ''}`,
    };
  }
  const signal = signalOf(exitCode, false);
  if (signal !== null && SIGNAL_KINDS[signal]) return { kind: SIGNAL_KINDS[signal].kind, line: null, message: SIGNAL_KINDS[signal].message };
  return { kind: CodeErrorKind.OTHER, line: null, message: exitCode !== null ? `Exited with code ${exitCode}` : 'Runtime error' };
}

/**
 * Classifies a failed run. `compile` is true for the output of a compile step
 * (status COMPILATION_ERROR). Returns null for runs that didn't fail.
 */
export function classifyError(
  language: CodeLanguage,
  stderr: string,
  exitCode: number | null,
  compile = false,
): CodeErrorInfo | null {
  switch (language) {
    case CodeLanguage.C:
    case CodeLanguage.CPP:
      return compile ? classifyCompile(stderr) : classifyNative(stderr, exitCode);
    case CodeLanguage.JAVA:
      return compile ? classifyCompile(stderr) : classifyJava(stderr, exitCode);
    case CodeLanguage.PYTHON:
    default:
      return classifyPython(stderr, exitCode);
  }
}

/**
 * Python reports a syntax error in the student's file before running any of
 * it, without a "Traceback" header. A SyntaxError raised later by eval() or
 * exec() comes with a traceback, so it stays a runtime error.
 */
function isPythonCompileFailure(stderr: string, error: CodeErrorInfo): boolean {
  return COMPILE_KINDS.has(error.kind) && !PYTHON_TRACEBACK.test(stderr);
}

/**
 * Adds `error` to an outcome that failed with a compile or runtime error, and
 * marks a run that never got past compilation as COMPILATION_ERROR. Other
 * outcomes come back unchanged. Safe to apply twice.
 */
export function classifyOutcome(outcome: ExecutionOutcome, language: CodeLanguage): ExecutionOutcome {
  if (outcome.status !== ExecutionStatus.RUNTIME_ERROR && outcome.status !== ExecutionStatus.COMPILATION_ERROR) {
    return outcome;
  }
  const error = classifyError(
    language,
    outcome.stderr,
    outcome.exitCode,
    outcome.status === ExecutionStatus.COMPILATION_ERROR && language !== CodeLanguage.PYTHON,
  );
  if (!error) return outcome;
  const status =
    outcome.status === ExecutionStatus.RUNTIME_ERROR &&
    language === CodeLanguage.PYTHON &&
    isPythonCompileFailure(outcome.stderr, error)
      ? ExecutionStatus.COMPILATION_ERROR
      : outcome.status;
  return { ...outcome, status, error };
}
