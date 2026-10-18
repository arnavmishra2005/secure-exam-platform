/**
 * Owner: Person B (coding questions + code execution)
 * Plain type/interface declarations only — no logic.
 */

/** Languages a coding question can allow. Only Python for now. */
export enum CodeLanguage {
  PYTHON = 'python',
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
  /** Non-zero exit (uncaught exception, syntax error, sys.exit(1)...). */
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
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  TIME_LIMIT_EXCEEDED = 'TIME_LIMIT_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
  OUTPUT_LIMIT_EXCEEDED = 'OUTPUT_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
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

// ---- Authoring (admin only) ----

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
}

export interface SampleTestResult {
  index: number;
  verdict: TestCaseVerdict;
  input: string;
  expectedOutput: string;
  stdout: string;
  stderr: string;
  timeMs: number;
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

/** Full per-test detail stored on a submission; admin-only. */
export interface StoredTestResult {
  testCaseId: string;
  verdict: TestCaseVerdict;
  weight: number;
  stdout: string;
  stderr: string;
  timeMs: number;
}

// ---- Limits shared by the API and the editor UI ----

/** Max characters of code per run/submit. Matches the answer draft limit (SaveAnswerDto.textResponse). */
export const CODE_MAX_LENGTH = 10_000;
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
