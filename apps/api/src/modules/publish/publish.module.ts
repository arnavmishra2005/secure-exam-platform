// Owner: Person A (Platform, Courses, Publish, Results)

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseModule } from '../course/course.module';
import { ExamModule } from '../exam/exam.module';
import { NotificationModule } from '../notification/notification.module';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';

@Module({
  imports: [
    // ExamModule re-exports the ExamEntity repository.
    ExamModule,
    TypeOrmModule.forFeature([ExamQuestionEntity]),
    CourseModule,
    NotificationModule,
  ],
  controllers: [PublishController],
  providers: [PublishService],
})
export class PublishModule {}
