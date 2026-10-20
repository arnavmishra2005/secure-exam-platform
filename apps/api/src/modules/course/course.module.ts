// Owner: Person A (Platform, Courses, Publish, Results)
// Courses, enrollment, and exam registration. Other modules ask
// RegistrationService "is this user registered?" instead of reading the
// tables themselves.

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamEntity } from '../exam/entities/exam.entity';
import { NotificationModule } from '../notification/notification.module';
import { UserModule } from '../user/user.module';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { CourseEnrollmentEntity } from './entities/course-enrollment.entity';
import { CourseEntity } from './entities/course.entity';
import { ExamCourseEntity } from './entities/exam-course.entity';
import { ExamRegistrationEntity } from './entities/exam-registration.entity';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseEntity,
      CourseEnrollmentEntity,
      ExamCourseEntity,
      ExamRegistrationEntity,
      // Read-only here (exists / publishedAt checks). Importing ExamModule
      // instead would create a cycle, since ExamModule uses RegistrationService.
      ExamEntity,
    ]),
    UserModule,
    NotificationModule,
  ],
  controllers: [CourseController, RegistrationController],
  providers: [CourseService, RegistrationService],
  exports: [CourseService, RegistrationService],
})
export class CourseModule {}
