// Owner: Person A (Platform, Courses, Publish, Results)
// The real ScoreRecorder (contract: common/scoring/score-recorder.interface.ts).

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type { RecordScoreInput, ScoreRecorder } from '../../common/scoring/score-recorder.interface';
import { ResultEntity } from '../answer/entities/result.entity';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { QuestionScoreEntity } from './entities/question-score.entity';

@Injectable()
export class ScoreRecorderService implements ScoreRecorder {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async record(input: RecordScoreInput): Promise<void> {
    const { attemptId, ...rest } = input;
    await this.recordMany(attemptId, [rest]);
  }

  async recordMany(attemptId: string, inputs: Omit<RecordScoreInput, 'attemptId'>[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const attempt = await manager.getRepository(AttemptEntity).findOne({ where: { id: attemptId } });
      if (!attempt) throw new NotFoundException(`Attempt ${attemptId} not found`);

      if (inputs.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(QuestionScoreEntity)
          .values(
            inputs.map((input) => ({
              attemptId,
              examId: attempt.examId,
              studentId: attempt.studentId,
              questionId: input.questionId,
              source: input.source,
              score: input.score,
              maxScore: input.maxScore,
              isCorrect: input.isCorrect ?? null,
              details: input.details ?? null,
            })) as QueryDeepPartialEntity<QuestionScoreEntity>[],
          )
          .orUpdate(['source', 'score', 'maxScore', 'isCorrect', 'details', 'gradedAt'], ['attemptId', 'questionId'])
          .execute();
      }

      await this.recomputeResult(manager, attemptId);
    });
  }

  /** Result.score := sum of the attempt's question scores. No-op if there is no Result yet. */
  private async recomputeResult(manager: EntityManager, attemptId: string): Promise<void> {
    const row: { total: string | null } | undefined = await manager
      .getRepository(QuestionScoreEntity)
      .createQueryBuilder('qs')
      .select('SUM(qs.score)', 'total')
      .where('qs.attemptId = :attemptId', { attemptId })
      .getRawOne();
    const total = Number(row?.total ?? 0);
    await manager.getRepository(ResultEntity).update({ attemptId }, { score: Math.round(total * 100) / 100 });
  }
}
