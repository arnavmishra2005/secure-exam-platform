/**
 * Owner: Person B (question-wise results). Admin-only shapes.
 * Plain type/interface declarations only — no logic.
 */

import type { AttemptStatus } from './attempt.types';
import type { CodeLanguage, CodeSubmissionStatus, TestCaseVerdict } from './coding.types';
import type { QuestionType } from './question.types';

/** What one student did on one question. */
export enum QuestionCellState {
  /** No answer (or an empty code draft). */
  NOT_ANSWERED = 'NOT_ANSWERED',
  /** Full marks. */
  CORRECT = 'CORRECT',
  /** Some marks (coding only: some tests passed). */
  PARTIAL = 'PARTIAL',
  /** Answered, zero marks. */
  WRONG = 'WRONG',
  /** Coding answer not graded yet (attempt in progress, or grading not run yet). */
  PENDING = 'PENDING',
}

export interface AnalyticsQuestion {
  id: string;
  /** 1-based position in the exam. */
  number: number;
  text: string;
  type: QuestionType;
  marks: number;
  /** MCQ / True-False options in display order (admin view: includes the key). */
  options?: { id: string; text: string; isCorrect: boolean }[];
}

export interface AnalyticsStudentRow {
  attemptId: string;
  /** users.id */
  studentId: string;
  fullName: string;
  email: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  /** Sum of cell scores (MCQ computed here + final code scores). */
  score: number;
  maxScore: number;
  answeredCount: number;
}

export interface AnalyticsCell {
  attemptId: string;
  questionId: string;
  state: QuestionCellState;
  /** Null while PENDING. */
  score: number | null;
  maxScore: number;
  markedForReview: boolean;
}

export interface QuestionStats {
  questionId: string;
  /** Attempts in the exam. */
  attempts: number;
  answered: number;
  correct: number;
  partial: number;
  wrong: number;
  notAnswered: number;
  pending: number;
  /** Mean score over graded attempts (answered or not), null if none graded. */
  averageScore: number | null;
  /** correct / graded, 0–1, null if none graded. */
  accuracy: number | null;
  /** MCQ / True-False: how many attempts selected each option. */
  optionCounts?: Record<string, number>;
  /** Coding: share of executed tests that passed across final submissions, 0–1. */
  testPassRate?: number | null;
}

export interface QuestionAnalyticsMatrix {
  exam: { id: string; title: string; status: string };
  questions: AnalyticsQuestion[];
  students: AnalyticsStudentRow[];
  cells: AnalyticsCell[];
  stats: QuestionStats[];
}

// ---- Drill-down: one attempt ----

export interface DrilldownOption {
  id: string;
  text: string;
  isCorrect: boolean;
  selected: boolean;
}

export interface DrilldownTestResult {
  index: number;
  isSample: boolean;
  verdict: TestCaseVerdict;
  weight: number;
  timeMs: number;
  input: string;
  expectedOutput: string;
  /** Captured output (capped). */
  stdout: string;
  stderr: string;
}

export interface DrilldownCode {
  /** The code that counted (final submission), else the saved draft. */
  code: string;
  language: CodeLanguage;
  /**
   * FINAL_SUBMIT: last Submit before the end (graded, or being regraded if status is PENDING);
   * FINAL_DRAFT: draft graded at the end; SUBMITTED: saved with Submit, not graded yet;
   * DRAFT: autosaved draft, not graded yet.
   */
  source: 'FINAL_SUBMIT' | 'FINAL_DRAFT' | 'SUBMITTED' | 'DRAFT';
  status: CodeSubmissionStatus | null;
  passed: number;
  total: number;
  tests: DrilldownTestResult[];
  /** Number of times the student pressed Submit. */
  submitCount: number;
  /** Number of Run clicks. */
  runCount: number;
}

export interface DrilldownQuestion extends AnalyticsQuestion {
  state: QuestionCellState;
  score: number | null;
  markedForReview: boolean;
  answeredAt: string | null;
  /** MCQ / True-False. */
  options?: DrilldownOption[];
  /** Coding. */
  code?: DrilldownCode | null;
}

export interface AttemptDrilldown {
  exam: { id: string; title: string };
  student: AnalyticsStudentRow;
  questions: DrilldownQuestion[];
}
