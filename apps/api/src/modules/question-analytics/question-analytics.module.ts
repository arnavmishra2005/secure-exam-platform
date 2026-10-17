import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeRunEntity } from '../coding/entities/code-run.entity';
import { CodeSubmissionEntity } from '../coding/entities/code-submission.entity';
import { CodingTestCaseEntity } from '../coding/entities/coding-test-case.entity';
import { ExamEntity } from '../exam/entities/exam.entity';
import { QuestionModule } from '../question/question.module';
import { ExamAttemptDataAdapter } from './exam-attempt-data.adapter';
import { QuestionAnalyticsController } from './question-analytics.controller';
import { QuestionAnalyticsService } from './question-analytics.service';

/** Owner: Person B. Question-wise results. Read-only. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExamEntity, CodeSubmissionEntity, CodeRunEntity, CodingTestCaseEntity]),
    QuestionModule,
  ],
  controllers: [QuestionAnalyticsController],
  providers: [QuestionAnalyticsService, ExamAttemptDataAdapter],
})
export class QuestionAnalyticsModule {}
