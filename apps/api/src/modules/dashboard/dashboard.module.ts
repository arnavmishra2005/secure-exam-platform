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
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    // Read-only views of other modules' rows, by id.
    TypeOrmModule.forFeature([AttemptEntity, ResultEntity, ExamQuestionEntity]),
    ExamModule,
    CourseModule,
    UserModule,
    NotificationModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
