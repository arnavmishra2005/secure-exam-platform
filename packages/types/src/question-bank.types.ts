/**
 * Owner: Person B (question bank)
 * Plain type/interface declarations only — no logic. All admin-only.
 */

import type {
  CodingProblem,
  CodingTestCase,
  OutputComparisonMode,
  StarterCode,
  TestCaseVerdict,
} from './coding.types';
import type {
  CreateOptionRequest,
  Option,
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
} from './question.types';

/** One row in the bank list. */
export interface BankQuestionSummary {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  courseId: string | null;
  topicId: string | null;
  topicName: string | null;
  difficulty: QuestionDifficulty | null;
  status: QuestionStatus;
  tags: string[];
  /** Number of exams the question is attached to. */
  usedInExams: number;
  /**
   * True when the question is in an ACTIVE or CLOSED exam (students have
   * answered it). It can still be edited — text, marks, correct options,
   * coding problem and tests — but its type and its number of options are
   * fixed, and results of those exams should be recalculated afterwards.
   */
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankCodingProblem extends Omit<CodingProblem, 'questionId'> {
  tests: Omit<CodingTestCase, 'questionId'>[];
}

export interface BankQuestionDetail extends BankQuestionSummary {
  negativeMarks: number | null;
  explanation: string | null;
  options: Option[];
  /** Present for CODING questions. */
  coding: BankCodingProblem | null;
  /**
   * ACTIVE / CLOSED exams using this question. Editing it changes grading
   * for students who already took them, so recalculate those exams after saving.
   */
  liveExams: { id: string; title: string; status: string }[];
}

export interface BankQuestionPage {
  items: BankQuestionSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface BankQuestionQuery {
  /** Case-insensitive match on the question text. */
  search?: string;
  courseId?: string;
  topicId?: string;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
  status?: QuestionStatus;
  tag?: string;
  /** Hide questions already in this exam (for the add-to-exam picker). */
  excludeExamId?: string;
  page?: number;
  limit?: number;
}

export interface CodingTestCaseInput {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  weight?: number;
}

export interface CodingProblemInput {
  statementMd: string;
  starterCode?: StarterCode;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  comparisonMode?: OutputComparisonMode;
  referenceSolution?: string | null;
  /** Replaces all test cases; order is kept. */
  tests: CodingTestCaseInput[];
}

/**
 * Create, or replace the whole question (PUT). MCQ types need `options`;
 * CODING needs `coding` and no options.
 */
export interface SaveBankQuestionRequest {
  text: string;
  type: QuestionType;
  marks: number;
  negativeMarks?: number | null;
  explanation?: string | null;
  courseId?: string | null;
  topicId?: string | null;
  difficulty?: QuestionDifficulty | null;
  status?: QuestionStatus;
  tags?: string[];
  options?: CreateOptionRequest[];
  coding?: CodingProblemInput;
}

/** Metadata only; allowed even when the question is locked. Omitted fields are unchanged. */
export interface UpdateBankQuestionMetaRequest {
  courseId?: string | null;
  topicId?: string | null;
  difficulty?: QuestionDifficulty | null;
  status?: QuestionStatus;
  tags?: string[];
}

export interface CreateTopicRequest {
  name: string;
  courseId?: string | null;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface BulkAddToExamRequest {
  questionIds: string[];
}

export interface BulkAddToExamResult {
  added: string[];
  skipped: { questionId: string; reason: string }[];
}

// ---- Validate a coding problem (author's check before saving/using it) ----

export interface ValidateCodingRequest {
  /** The problem as currently edited (doesn't need to be saved). */
  coding: CodingProblemInput;
  /** Code to run; defaults to coding.referenceSolution. */
  code?: string;
}

export interface ValidateCodingTestResult {
  index: number;
  isSample: boolean;
  verdict: TestCaseVerdict;
  timeMs: number;
  expectedOutput: string;
  stdout: string;
  stderr: string;
}

export interface ValidateCodingResponse {
  /** True when every test passed. */
  ok: boolean;
  passed: number;
  total: number;
  /** Slowest test as a share of the time limit, 0–1+: warns about limits that are too tight. */
  slowestShareOfLimit: number;
  tests: ValidateCodingTestResult[];
}

// ---- Recalculate results after editing questions ----

export interface RecalculateRequest {
  /** Limit to one question; omit for the whole exam. */
  questionId?: string;
}

export interface RecalculateResponse {
  /** Finished attempts in scope. */
  attempts: number;
  /** Totals updated right away (MCQ changes, coding marks rescaled from stored test results). */
  recalculatedNow: number;
  /** Coding answers queued to run again because their tests changed; totals update as each finishes. */
  queuedToRerun: number;
}
