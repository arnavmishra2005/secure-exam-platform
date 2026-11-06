import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodingModule } from '../coding/coding.module';
import { CodeRunEntity } from '../coding/entities/code-run.entity';
import { CodeSubmissionEntity } from '../coding/entities/code-submission.entity';
import { CodingTestCaseEntity } from '../coding/entities/coding-test-case.entity';
import { ExamEntity } from '../exam/entities/exam.entity';
import { QuestionModule } from '../question/question.module';
import { QuestionScoreEntity } from '../results/entities/question-score.entity';
import { ExamAttemptDataAdapter } from './exam-attempt-data.adapter';
import { QuestionAnalyticsController } from './question-analytics.controller';
import { QuestionAnalyticsService } from './question-analytics.service';
import { ScoreAdjustmentService } from './score-adjustment.service';

/** Owner: Person B. Question-wise results, and manual mark adjustment (#13). */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExamEntity, CodeSubmissionEntity, CodeRunEntity, CodingTestCaseEntity, QuestionScoreEntity]),
    QuestionModule,
    // ResultTotalsService: recomputes the attempt's total after an adjustment.
    CodingModule,
  ],
  controllers: [QuestionAnalyticsController],
  providers: [QuestionAnalyticsService, ExamAttemptDataAdapter, ScoreAdjustmentService],
})
export class QuestionAnalyticsModule {}
