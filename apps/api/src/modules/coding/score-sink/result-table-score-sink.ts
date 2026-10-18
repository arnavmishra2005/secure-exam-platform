import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ResultEntity } from '../../answer/entities/result.entity';
import { CodeScoreRecord, ICodeScoreSink } from './code-score-sink.interface';

/**
 * Interim sink until Person A's ScoreRecorder exists: adds the code score
 * to the attempt's Result. `computeScore` already counted the question's
 * marks in `maxScore` and gave it 0, so adding the score once is exact.
 */
@Injectable()
export class ResultTableScoreSink implements ICodeScoreSink {
  async record(manager: EntityManager, record: CodeScoreRecord): Promise<void> {
    const res = await manager
      .getRepository(ResultEntity)
      .increment({ attemptId: record.attemptId }, 'score', record.score);
    if (!res.affected) {
      throw new Error(`No result row for attempt ${record.attemptId}`);
    }
  }

  async replaceTotals(manager: EntityManager, attemptId: string, score: number, maxScore: number): Promise<void> {
    const res = await manager.getRepository(ResultEntity).update({ attemptId }, { score, maxScore });
    if (!res.affected) throw new Error(`No result row for attempt ${attemptId}`);
  }
}
