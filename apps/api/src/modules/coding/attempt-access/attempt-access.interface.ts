/**
 * Owner: Person B.
 *
 * The coding module's own view of an attempt, so run/submit/grading code
 * never imports attempt/answer services directly. The adapter binds it to
 * the attempt owner's real services; tests bind a fake.
 */

import type { JwtPayload, QuestionState } from '@secure-exam/types';

export const ATTEMPT_ACCESS = Symbol('ATTEMPT_ACCESS');

export interface WritableAttempt {
  id: string;
  examId: string;
  /** users.id */
  studentId: string;
}

export interface IAttemptAccess {
  /**
   * Resolves only if `user` owns the attempt, it is IN_PROGRESS and not
   * expired. Throws the same HTTP errors as saving an answer (404/403/409);
   * an expired attempt is auto-submitted as a side effect.
   */
  assertWritable(attemptId: string, user: JwtPayload): Promise<WritableAttempt>;

  /**
   * Finalized (SUBMITTED / AUTO_SUBMITTED) attempts with a CODING question
   * that has no final code submission yet, oldest first. One row per
   * attempt + question.
   */
  findAwaitingCodeGrading(limit: number): Promise<PendingCodeGrade[]>;

  /** The student's saved code draft (the answer's textResponse), or null. */
  getDraftCode(attemptId: string, questionId: string): Promise<string | null>;

  /** Finished (SUBMITTED / AUTO_SUBMITTED) attempts at an exam. */
  listFinishedAttempts(examId: string, attemptIds?: string[]): Promise<FinishedAttempt[]>;

  /** One finished attempt, or null if it doesn't exist or isn't finished. */
  getFinishedAttempt(attemptId: string): Promise<FinishedAttempt | null>;

  /** All saved answers of one attempt (for recomputing its total). */
  getAnswers(attemptId: string): Promise<AttemptAnswer[]>;
}

export interface FinishedAttempt {
  attemptId: string;
  examId: string;
  studentId: string;
  submittedAt: Date;
}

export interface AttemptAnswer {
  questionId: string;
  selectedOptionIds: string[] | null;
  textResponse: string | null;
  state: QuestionState;
}

export interface PendingCodeGrade {
  attemptId: string;
  examId: string;
  /** users.id */
  studentId: string;
  questionId: string;
  submittedAt: Date;
}
