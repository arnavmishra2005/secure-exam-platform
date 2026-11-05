/**
 * Owner: Person C (Time Extension, Dashboard)
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResultEntity } from '../answer/entities/result.entity';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { CourseModule } from '../course/course.module';
import { ExamModule } from '../exam/exam.module';
import { NotificationModule } from '../notification/notification.module';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { UserModule } from '../user/user.module';
import { DashboardController } from './dashboard.controller';
import { StudentSubmissionService } from './student-submission.service';
import { QuestionModule } from '../question/question.module';
import { CodingContentModule } from '../coding/coding-content.module';
import { ExamExtensionEntity } from '../extension/entities/exam-extension.entity';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    // Read-only views of other modules' rows, by id.
    TypeOrmModule.forFeature([AttemptEntity, ResultEntity, ExamQuestionEntity, ExamExtensionEntity]),
    ExamModule,
    QuestionModule,
    CodingContentModule,
    CourseModule,
    UserModule,
    NotificationModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, StudentSubmissionService],
})
export class DashboardModule {}
