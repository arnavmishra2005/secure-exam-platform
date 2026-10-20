/**
 * Owner: Person B.
 *
 * Where a graded coding score goes: Person A's ScoreRecorder, as AUTO_CODE
 * (ScoreRecorderCodeScoreSink). ResultTableScoreSink is the old interim
 * binding and is no longer used.
 */

import type { EntityManager } from 'typeorm';

export const CODE_SCORE_SINK = Symbol('CODE_SCORE_SINK');

export interface CodeScoreRecord {
  attemptId: string;
  examId: string;
  questionId: string;
  /** users.id */
  studentId: string;
  score: number;
  maxScore: number;
}

export interface ICodeScoreSink {
  /**
   * Called inside the grading transaction, exactly once per attempt +
   * question (guarded by the unique final-submission index). Throwing rolls
   * the grade back; it is retried on the next sweep.
   */
  record(manager: EntityManager, record: CodeScoreRecord): Promise<void>;

  /**
   * Sets an attempt's total and maximum outright (after a professor edited
   * questions and recalculated). Replaces any manual score override.
   */
  replaceTotals(manager: EntityManager, attemptId: string, score: number, maxScore: number): Promise<void>;
}
