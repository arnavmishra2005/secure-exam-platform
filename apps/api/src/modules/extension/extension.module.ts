/**
 * Owner: Person C (Time Extension, Dashboard)
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseModule } from '../course/course.module';
import { ExamModule } from '../exam/exam.module';
import { NotificationModule } from '../notification/notification.module';
import { UserModule } from '../user/user.module';
import { ExamExtensionEntity } from './entities/exam-extension.entity';
import { ExtensionController } from './extension.controller';
import { ExtensionService } from './extension.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamExtensionEntity]),
    ExamModule,
    CourseModule,
    UserModule,
    NotificationModule,
  ],
  controllers: [ExtensionController],
  providers: [ExtensionService],
  exports: [ExtensionService],
})
export class ExtensionModule {}
