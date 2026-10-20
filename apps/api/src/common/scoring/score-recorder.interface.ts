// [SHARED — Day 1 contract] The one way any grader writes a per-question
// score. Person A owns the implementation (modules/results); Person B's code
// grader and A's MCQ evaluator both call it.
//
//   constructor(@Inject(SCORE_RECORDER) private readonly scores: ScoreRecorder) {}
//   await this.scores.record({ attemptId, questionId, source: ScoreSource.AUTO_CODE, score, maxScore });
//
// Recording is an upsert keyed by (attemptId, questionId): the latest call
// wins. After every write the attempt's Result.score is recomputed as the
// sum of its question scores.
//
// Pass `manager` to write inside a transaction you already hold (Person B's
// code grader does, so the grade and its score commit together). Without it,
// the recorder opens its own transaction.

import type { EntityManager } from 'typeorm';
import type { ScoreSource } from '@secure-exam/types';

export const SCORE_RECORDER = Symbol('SCORE_RECORDER');

export interface RecordScoreInput {
  attemptId: string;
  questionId: string;
  source: ScoreSource;
  /** May be negative when negative marking applies. */
  score: number;
  maxScore: number;
  /** null when the student left the question unanswered. */
  isCorrect?: boolean | null;
  /** Grader-specific detail (selected options, test results, ...). */
  details?: Record<string, unknown> | null;
}

export interface ScoreRecorder {
  record(input: RecordScoreInput, manager?: EntityManager): Promise<void>;
  /** Records several scores for one attempt, then recomputes its total once. */
  recordMany(
    attemptId: string,
    inputs: Omit<RecordScoreInput, 'attemptId'>[],
    manager?: EntityManager,
  ): Promise<void>;
}
