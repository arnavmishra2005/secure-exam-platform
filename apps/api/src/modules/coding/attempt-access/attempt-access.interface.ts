/**
 * Owner: Person B.
 *
 * The coding module's own view of an attempt, so run/submit/grading code
 * never imports attempt/answer services directly. The adapter binds it to
 * the attempt owner's real services; tests bind a fake.
 */

import type { JwtPayload } from '@secure-exam/types';

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
}
