/**
 * Owner: Person C (Attempt / Answer / Submission / Monitoring)
 */

import { QuestionState } from './attempt.types';

export interface Answer {
  id: string;
  attemptId: string;
  /** Person B's Question.id — referenced by ID only. */
  questionId: string;
  /** Present for objective questions (single/multiple choice). */
  selectedOptionIds: string[] | null;
  /** Present for descriptive/free-text questions. */
  textResponse: string | null;
  state: QuestionState;
  /** ISO 8601, or null if the question has no saved response yet. */
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  id: string;
  attemptId: string;
  /** ISO 8601 */
  submittedAt: string;
  /** True when the server finalized this on expiry rather than a manual Submit click. */
  isAutoSubmitted: boolean;
  totalQuestions: number;
  answeredCount: number;
  createdAt: string;
}

export interface Result {
  id: string;
  attemptId: string;
  /** Person B's Exam.id — referenced by ID only. */
  examId: string;
  /** Person A's Student.id — referenced by ID only. */
  studentId: string;
  score: number;
  maxScore: number;
  /** True when every question in the exam could be auto-graded. */
  autoGraded: boolean;
  /** True when at least one subjective question still needs a human grader. */
  needsManualReview: boolean;
  published: boolean;
  /** ISO 8601, or null while unpublished. */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
