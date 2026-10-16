/**
 * Owner: Person B (question bank)
 * Plain type/interface declarations only — no logic. All admin-only.
 */

import type { CodingProblem, CodingTestCase, OutputComparisonMode, StarterCode } from './coding.types';
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
   * True when the question is in an ACTIVE or CLOSED exam: its content
   * (text, type, marks, options, coding problem, tests) can't change.
   * Metadata (course, topic, difficulty, status, tags) still can.
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
