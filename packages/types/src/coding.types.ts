/**
 * Owner: Person B (Question Bank, Code Editor, Question-wise Results)
 *
 * CONTRACT ONLY (Day 1 morning). Person B implements the coding question
 * type, the Docker runner behind ExecutionProvider, and these endpoints:
 *   POST /attempts/:id/code/run     RunCodeRequest    -> CodeRunResult
 *   POST /attempts/:id/code/submit  SubmitCodeRequest -> CodeSubmission
 * Scores are recorded through ScoreRecorder with source AUTO_CODE.
 */

/** Question.type value Person B adds for coding questions. */
export const CODING_QUESTION_TYPE = 'CODING' as const;

/** Keys of apps/api/src/modules/code-runner/language.registry.ts. */
export type CodeLanguage = 'python';

export interface CodingProblem {
  id: string;
  questionId: string;
  language: CodeLanguage;
  starterCode: string;
  /** Wall-clock limit per test case. */
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface CodingTestCase {
  id: string;
  problemId: string;
  stdin: string;
  expectedStdout: string;
  /** Hidden cases are graded but never sent to students. */
  isHidden: boolean;
  /** Relative weight in the question's partial score. */
  weight: number;
  order: number;
}

export enum CodeRunStatus {
  OK = 'OK',
  COMPILE_ERROR = 'COMPILE_ERROR',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  TIME_LIMIT = 'TIME_LIMIT',
  MEMORY_LIMIT = 'MEMORY_LIMIT',
  OUTPUT_LIMIT = 'OUTPUT_LIMIT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface CodeRun {
  id: string;
  attemptId: string;
  questionId: string;
  status: CodeRunStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
  createdAt: string;
}

export interface CodeTestResult {
  testCaseId: string;
  passed: boolean;
  status: CodeRunStatus;
  /** Only populated for non-hidden cases. */
  stdout?: string;
  expectedStdout?: string;
}

export interface CodeSubmission {
  id: string;
  attemptId: string;
  questionId: string;
  code: string;
  score: number;
  maxScore: number;
  results: CodeTestResult[];
  createdAt: string;
}

/** Frozen copy of a question taken when its exam is published. */
export interface ExamQuestionSnapshot {
  id: string;
  examId: string;
  questionId: string;
  /** Full question as it was at publish time, including the answer key. */
  snapshot: Record<string, unknown>;
  createdAt: string;
}

export interface RunCodeRequest {
  questionId: string;
  code: string;
  stdin?: string;
  /** Run against the question's non-hidden sample cases instead of stdin. */
  runSamples?: boolean;
}

export interface CodeRunResult {
  run: CodeRun;
  samples?: CodeTestResult[];
}

export interface SubmitCodeRequest {
  questionId: string;
  code: string;
}
