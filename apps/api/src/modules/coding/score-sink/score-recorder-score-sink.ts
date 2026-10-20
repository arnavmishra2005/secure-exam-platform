import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ScoreSource } from '@secure-exam/types';
import { SCORE_RECORDER, ScoreRecorder } from '../../../common/scoring/score-recorder.interface';
import { ResultEntity } from '../../answer/entities/result.entity';
import { CodeScoreRecord, ICodeScoreSink } from './code-score-sink.interface';

/**
 * Sends graded coding scores to Person A's ScoreRecorder (source AUTO_CODE),
 * so they land in question_scores next to the MCQ scores. The recorder keeps
 * Result.score equal to the sum of those rows, which means a later MCQ
 * grading or /results recompute can no longer wipe the code marks.
 *
 * Runs inside the grading transaction (`manager`), as before.
 */
@Injectable()
export class ScoreRecorderCodeScoreSink implements ICodeScoreSink {
  constructor(@Inject(SCORE_RECORDER) private readonly scores: ScoreRecorder) {}

  async record(manager: EntityManager, record: CodeScoreRecord): Promise<void> {
    await this.scores.record(
      {
        attemptId: record.attemptId,
        questionId: record.questionId,
        source: ScoreSource.AUTO_CODE,
        score: record.score,
        maxScore: record.maxScore,
        isCorrect: record.maxScore > 0 && record.score >= record.maxScore,
      },
      manager,
    );
  }

  /**
   * Recalculation after a professor edited questions: the total was just
   * recomputed from every question, so it replaces Result.score outright.
   * (It equals the sum of question_scores once the exam's MCQ and code
   * scores have been regraded.)
   */
  async replaceTotals(manager: EntityManager, attemptId: string, score: number, maxScore: number): Promise<void> {
    const res = await manager.getRepository(ResultEntity).update({ attemptId }, { score, maxScore });
    if (!res.affected) throw new Error(`No result row for attempt ${attemptId}`);
  }
}
