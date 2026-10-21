// Owner: Person A (Platform, Courses, Publish, Results)
// @Global so any module can inject SCORE_RECORDER (Person B's code grader
// does) without importing ResultsModule and creating cycles.

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SCORE_RECORDER } from '../../common/scoring/score-recorder.interface';
import { AnswerEntity } from '../answer/entities/answer.entity';
import { ResultEntity } from '../answer/entities/result.entity';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { ClientSecurityModule } from '../client-security/client-security.module';
import { CourseModule } from '../course/course.module';
import { ExamModule } from '../exam/exam.module';
import { NotificationModule } from '../notification/notification.module';
import { QuestionModule } from '../question/question.module';
import { UserModule } from '../user/user.module';
import { QuestionScoreEntity } from './entities/question-score.entity';
import { McqGradingService } from './mcq-grading.service';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { ScoreRecorderService } from './score-recorder.service';

@Global()
@Module({
  imports: [
    // Other modules' entities are read by id only, never through their services' internals.
    TypeOrmModule.forFeature([QuestionScoreEntity, AttemptEntity, AnswerEntity, ResultEntity]),
    ExamModule,
    QuestionModule,
    CourseModule,
    UserModule,
    NotificationModule,
    ClientSecurityModule, // violation counts in the student-wise table
  ],
  controllers: [ResultsController],
  providers: [
    ResultsService,
    McqGradingService,
    ScoreRecorderService,
    // Day 1 contract bound this to NoopScoreRecorder; this is the real one.
    { provide: SCORE_RECORDER, useExisting: ScoreRecorderService },
  ],
  exports: [SCORE_RECORDER, ResultsService],
})
export class ResultsModule {}
