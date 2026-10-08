import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnswerEntity } from './entities/answer.entity';
import { SubmissionEntity } from './entities/submission.entity';
import { ResultEntity } from './entities/result.entity';
import { AnswerController, AttemptQuestionController } from './answer.controller';
import { SubmissionAdminController, SubmissionController } from './submission.controller';
import { AnswerService } from './answer.service';
import { SubmissionService } from './submission.service';
import { AttemptExpirySweepService } from './attempt-expiry-sweep.service';
import { QUESTION_LOOKUP_SERVICE } from './question-lookup/question-lookup.interface';
import { QuestionLookupAdapter } from './question-lookup/question-lookup.adapter';
import { AttemptModule } from '../attempt/attempt.module';
import { QuestionModule } from '../question/question.module';

// Note: AuditModule is @Global() in Person A's AppModule, so AuditService
// is available to AnswerService/SubmissionService via DI without re-importing here.

@Module({
  imports: [
    TypeOrmModule.forFeature([AnswerEntity, SubmissionEntity, ResultEntity]),
    AttemptModule,
    QuestionModule,
  ],
  controllers: [AnswerController, AttemptQuestionController, SubmissionController, SubmissionAdminController],
  providers: [
    AnswerService,
    SubmissionService,
    AttemptExpirySweepService,
    { provide: QUESTION_LOOKUP_SERVICE, useClass: QuestionLookupAdapter },
  ],
  exports: [AnswerService, SubmissionService],
})
export class AnswerModule {}
