// [SHARED — Day 1 contract] Stand-in ScoreRecorder used before Person A's
// real one landed, and still handy in unit tests that don't care about
// scoring. Production wiring uses ScoreRecorderService (modules/results).

import { Injectable, Logger } from '@nestjs/common';
import type { RecordScoreInput, ScoreRecorder } from './score-recorder.interface';

@Injectable()
export class NoopScoreRecorder implements ScoreRecorder {
  private readonly logger = new Logger(NoopScoreRecorder.name);

  async record(input: RecordScoreInput): Promise<void> {
    this.logger.debug(`Discarding score for attempt ${input.attemptId}, question ${input.questionId}`);
  }

  async recordMany(attemptId: string, inputs: Omit<RecordScoreInput, 'attemptId'>[]): Promise<void> {
    this.logger.debug(`Discarding ${inputs.length} score(s) for attempt ${attemptId}`);
  }
}
