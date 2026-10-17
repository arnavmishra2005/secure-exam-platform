/**
 * Owner: Person B (Exam Content Domain)
 * Plain type/interface declarations only — no logic.
 */

import type { PublicCodingProblem } from './coding.types';

export enum QuestionType {
  MCQ_SINGLE = 'MCQ_SINGLE',
  MCQ_MULTI = 'MCQ_MULTI',
  TRUE_FALSE = 'TRUE_FALSE',
  /** Programming question; details live in `coding.types.ts`. Has no options. */
  CODING = 'CODING',
}

export enum QuestionDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

/** Bank lifecycle. Only READY questions are offered when picking questions for an exam. */
export enum QuestionStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  ARCHIVED = 'ARCHIVED',
}

/** A topic groups bank questions, optionally within a course. */
export interface Topic {
  id: string;
  /** Person A's Course.id, referenced by ID only. */
  courseId?: string | null;
  name: string;
}

export interface Option {
  id: string;
  questionId: string;
  text: string;
  /**
   * NEVER return this field to a student-facing/attempt API.
   * Safe for the admin question bank only. See question.controller.ts
   * for the two serialization shapes (admin vs. exam-taking).
   */
  isCorrect: boolean;
  order: number;
}

/** Option shape safe to send to a student during an active attempt (no answer key). */
export type PublicOption = Omit<Option, 'isCorrect'>;

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  negativeMarks?: number;
  explanation?: string;
  /** Person A's Course.id, referenced by ID only. */
  courseId?: string | null;
  topicId?: string | null;
  difficulty?: QuestionDifficulty | null;
  status?: QuestionStatus;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionWithOptions extends Question {
  options: Option[];
}

export type PublicQuestion = Omit<
  Question,
  'explanation' | 'courseId' | 'topicId' | 'difficulty' | 'status' | 'tags'
> & {
  options: PublicOption[];
  /** Present for CODING questions only: statement, starter code and SAMPLE tests (never hidden ones). */
  coding?: PublicCodingProblem;
};

/** Join row mapping a Question into an Exam, with per-exam ordering. */
export interface ExamQuestion {
  id: string;
  examId: string;
  questionId: string;
  order: number;
}

// ---- Request/response shapes used by packages/api-client ----

export interface CreateOptionRequest {
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface CreateQuestionRequest {
  text: string;
  type: QuestionType;
  marks: number;
  negativeMarks?: number;
  explanation?: string;
  options: CreateOptionRequest[];
}

export interface UpdateQuestionRequest {
  text?: string;
  type?: QuestionType;
  marks?: number;
  negativeMarks?: number;
  explanation?: string;
}

export interface AddQuestionToExamRequest {
  questionId: string;
  order?: number;
}

export interface ReorderExamQuestionsRequest {
  /** Ordered list of ExamQuestion ids, in the new desired order. */
  orderedExamQuestionIds: string[];
}

export interface BulkImportRowError {
  row: number;
  message: string;
}

export interface BulkImportResult {
  createdCount: number;
  errors: BulkImportRowError[];
}
