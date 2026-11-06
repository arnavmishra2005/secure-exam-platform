// Owner: Person A (Platform, Courses, Publish, Results)
// Courses, their staff (instructors and TAs), enrollment, and exam registration. Other modules ask
// RegistrationService "is this user registered?" instead of reading the
// tables themselves.

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamEntity } from '../exam/entities/exam.entity';
import { NotificationModule } from '../notification/notification.module';
import { UserEntity } from '../user/entities/user.entity';
import { UserModule } from '../user/user.module';
import { AccessController } from './access.controller';
import { CourseStaffService } from './course-staff.service';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { CourseStaffEntity } from './entities/course-staff.entity';
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
      CourseStaffEntity,
      UserEntity,
      // Read-only here (exists / publishedAt checks). Importing ExamModule
      // instead would create a cycle, since ExamModule uses RegistrationService.
      ExamEntity,
    ]),
    UserModule,
    NotificationModule,
  ],
  controllers: [CourseController, RegistrationController, AccessController],
  providers: [CourseService, CourseStaffService, RegistrationService],
  exports: [CourseService, CourseStaffService, RegistrationService],
})
export class CourseModule {}
