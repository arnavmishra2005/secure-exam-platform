/**
 * Owner: Person B (coding questions + code execution)
 * Plain type/interface declarations only — no logic.
 */

/**
 * Languages a coding question can allow (phase 5 #16). Display names, editor
 * modes and starter code are in code-languages.ts; how each one compiles and
 * runs is in the API's execution/language.registry.ts.
 */
export enum CodeLanguage {
  PYTHON = 'python',
  C = 'c',
  CPP = 'cpp',
  JAVA = 'java',
}

/** How a program's stdout is compared with a test case's expected output. */
export enum OutputComparisonMode {
  /** Byte-for-byte equal. */
  EXACT = 'EXACT',
  /** Trailing whitespace on each line and trailing blank lines are ignored. */
  TRIM = 'TRIM',
  /** Whitespace-separated tokens must match; spacing and line breaks are ignored. */
  TOKENS = 'TOKENS',
}

/** Outcome of executing a program once. */
export enum ExecutionStatus {
  /** Exited with code 0. */
  OK = 'OK',
  /** The code didn't compile (Python: a syntax or indentation error), so no test ran. */
  COMPILATION_ERROR = 'COMPILATION_ERROR',
  /** Non-zero exit (uncaught exception, crash, sys.exit(1)...). */
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  TIME_LIMIT_EXCEEDED = 'TIME_LIMIT_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
  OUTPUT_LIMIT_EXCEEDED = 'OUTPUT_LIMIT_EXCEEDED',
  /** The sandbox itself failed (Docker unavailable, image missing...). Not the student's fault. */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** Verdict for one test case. */
export enum TestCaseVerdict {
  PASSED = 'PASSED',
  WRONG_ANSWER = 'WRONG_ANSWER',
  COMPILATION_ERROR = 'COMPILATION_ERROR',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  TIME_LIMIT_EXCEEDED = 'TIME_LIMIT_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
  OUTPUT_LIMIT_EXCEEDED = 'OUTPUT_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** What kind of error a failed run hit. Filled in by `classifyOutcome` (error-classifier.ts). */
export enum CodeErrorKind {
  SYNTAX = 'SYNTAX',
  INDENTATION = 'INDENTATION',
  NAME = 'NAME',
  TYPE = 'TYPE',
  VALUE = 'VALUE',
  INDEX = 'INDEX',
  KEY = 'KEY',
  ATTRIBUTE = 'ATTRIBUTE',
  ZERO_DIVISION = 'ZERO_DIVISION',
  /** Python EOFError: the program read more input than it was given. */
  EOF = 'EOF',
  IMPORT = 'IMPORT',
  /** Python RecursionError. */
  STACK_OVERFLOW = 'STACK_OVERFLOW',
  /** Killed by signal 11. */
  SEGFAULT = 'SEGFAULT',
  /** Killed by signal 6 (abort, failed C assert). */
  ABORT = 'ABORT',
  /**
   * Killed by signal 31 (SIGSYS): the sandbox's system-call filter stopped a
   * call no solution needs (ptrace, mount, ...). Flagged on Monitoring.
   */
  BLOCKED_SYSCALL = 'BLOCKED_SYSCALL',
  /** A C, C++ or Java compiler error (Python syntax errors stay SYNTAX / INDENTATION). */
  COMPILE = 'COMPILE',
  /** Java NullPointerException. */
  NULL_POINTER = 'NULL_POINTER',
  OTHER = 'OTHER',
}

/** A classified compile or runtime error. */
export interface CodeErrorInfo {
  kind: CodeErrorKind;
  /** Line in the student's file, when the error names one. */
  line: number | null;
  /** One-line message, e.g. "NameError: name 'x' is not defined". */
  message: string;
}

export enum CodeRunKind {
  /** Student's own stdin. */
  CUSTOM = 'CUSTOM',
  /** Against the problem's sample test cases. */
  SAMPLES = 'SAMPLES',
}

export enum CodeSubmissionStatus {
  /** Saved, not run yet: graded on the server after the attempt ends (or queued for regrading). */
  PENDING = 'PENDING',
  /** All test cases were executed (some may have failed). */
  GRADED = 'GRADED',
  /** The sandbox failed; the submission didn't count. */
  ERROR = 'ERROR',
  /** Saved but replaced by a later Submit before the attempt ended; never graded. */
  SUPERSEDED = 'SUPERSEDED',
}

// ---- Authoring (staff only) ----

/** Starter code per language, e.g. `{ python: "def solve():\n    ..." }`. */
export type StarterCode = Partial<Record<CodeLanguage, string>>;

export interface CodingProblem {
  /** Same id as the CODING Question it belongs to. */
  questionId: string;
  /** Problem statement in Markdown (rendered without raw HTML). */
  statementMd: string;
  starterCode: StarterCode;
  allowedLanguages: CodeLanguage[];
  timeLimitMs: number;
  memoryLimitMb: number;
  comparisonMode: OutputComparisonMode;
  /** Author's solution, used to validate test cases. Never sent to students. */
  referenceSolution?: string | null;
  /** Language of `referenceSolution` (default Python). */
  referenceLanguage?: CodeLanguage;
}

export interface CodingTestCase {
  id: string;
  questionId: string;
  input: string;
  expectedOutput: string;
  /** Samples are shown to students; hidden cases are not. */
  isSample: boolean;
  /** Relative weight for partial marks. */
  weight: number;
  order: number;
}

// ---- Student-facing (no hidden test data, no reference solution) ----

export interface PublicCodingTestCase {
  index: number;
  input: string;
  expectedOutput: string;
}

export interface PublicCodingProblem {
  statementMd: string;
  starterCode: StarterCode;
  allowedLanguages: CodeLanguage[];
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Lets the exam app compare sample outputs locally with the same rule the server grades with. */
  comparisonMode: OutputComparisonMode;
  samples: PublicCodingTestCase[];
}

// ---- Run / submit ----

export interface CodeRunRequest {
  questionId: string;
  language: CodeLanguage;
  code: string;
  kind: CodeRunKind;
  /** Only for kind = CUSTOM. */
  stdin?: string;
}

/** Result of running a program once (custom stdin). */
export interface ExecutionOutcome {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number;
  /** Set when status is COMPILATION_ERROR or RUNTIME_ERROR. */
  error?: CodeErrorInfo;
}

export interface SampleTestResult {
  index: number;
  verdict: TestCaseVerdict;
  input: string;
  expectedOutput: string;
  stdout: string;
  stderr: string;
  timeMs: number;
  error?: CodeErrorInfo;
}

export interface CodeRunResponse {
  /** Null if the run couldn't be recorded (the result is still valid). */
  runId: string | null;
  kind: CodeRunKind;
  /** Present for kind = CUSTOM. */
  outcome?: ExecutionOutcome;
  /** Present for kind = SAMPLES. */
  samples?: SampleTestResult[];
}

export interface CodeSubmitRequest {
  questionId: string;
  language: CodeLanguage;
  code: string;
}

/** Hidden-test result shown to a student: verdict only, no input or expected output. */
export interface HiddenTestResult {
  index: number;
  /** Lets the UI label tests "Sample 1" vs "Test 3". */
  isSample: boolean;
  verdict: TestCaseVerdict;
  /** Kind only: no message or line, which could reveal something about the hidden input. */
  errorKind?: CodeErrorKind;
  timeMs: number;
}

/**
 * DEFERRED grading (default): status PENDING, no `result` — the code is
 * saved as final and graded after the attempt ends.
 * LIVE grading: status GRADED with `result`.
 */
export interface CodeSubmitResponse {
  submissionId: string;
  status: CodeSubmissionStatus;
  savedAt: string;
  result?: {
    passed: number;
    total: number;
    score: number;
    maxScore: number;
    tests: HiddenTestResult[];
  };
}

/** Stored grading details. Student access is mapped separately after result publication. */
export interface StoredTestResult {
  testCaseId: string;
  verdict: TestCaseVerdict;
  weight: number;
  stdout: string;
  stderr: string;
  timeMs: number;
  errorKind?: CodeErrorKind;
  errorLine?: number | null;
}

// ---- Limits shared by the API and the editor UI ----

/** Max characters of code per run/submit. */
export const CODE_MAX_LENGTH = 10_000;
/**
 * Max characters of a saved code draft (SaveAnswerDto.textResponse): the code
 * plus the language header added by encodeCodeDraft (code-languages.ts).
 */
export const CODE_DRAFT_MAX_LENGTH = CODE_MAX_LENGTH + 32;
/** Max characters of custom stdin per run. */
export const CODE_STDIN_MAX_LENGTH = 65_536;

// ---- Execution modes (see "Decision log" in person_b_plan.md) ----

/** When Submit is graded. Server setting CODING_GRADING_MODE. */
export enum CodingGradingMode {
  /** Submit only saves; all tests run on the server after the attempt ends. */
  DEFERRED = 'DEFERRED',
  /** Submit runs all tests immediately and returns the score. */
  LIVE = 'LIVE',
}

/** GET /coding/config — what the exam app may do. */
export interface CodingClientConfig {
  gradingMode: CodingGradingMode;
  /** Whether Run / Run samples may execute on the server (fallback when the PC can't run code). */
  serverRunEnabled: boolean;
}

// ---- Local runner contract (implemented by Person C's Electron app) ----

/** One program, run once per input on the student's PC. */
export interface LocalRunJob {
  language: CodeLanguage;
  code: string;
  inputs: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Max bytes kept per stream per input. */
  outputLimitBytes: number;
}

/**
 * Runs code on the student's PC (e.g. python3 inside bubblewrap with no
 * network). Resolves with one outcome per input, using the same statuses as
 * the server. Rejects only when the runner itself can't work (Python
 * missing, sandbox failed) — never because of the student's program.
 */
export interface LocalRunner {
  run(job: LocalRunJob): Promise<ExecutionOutcome[]>;
}
