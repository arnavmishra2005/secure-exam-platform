import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttemptEntity } from './entities/attempt.entity';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { TimerService } from './timer.service';
import { EXAM_LOOKUP_SERVICE } from './exam-lookup/exam-lookup.interface';
import { ExamLookupAdapter } from './exam-lookup/exam-lookup.adapter';
import { ExamModule } from '../exam/exam.module';
import { CourseModule } from '../course/course.module';
import { UserModule } from '../user/user.module';
import { ClientSecurityModule } from '../client-security/client-security.module';
import { ExamExtensionEntity } from '../extension/entities/exam-extension.entity';

// Note: AuditModule is @Global() in Person A's AppModule, so AuditService
// is available to AttemptService via DI without re-importing AuditModule here.

@Module({
  imports: [
    // ExamExtensionEntity is Person C's own (modules/extension); read here to
    // apply per-student extra time at start and to show it on monitoring.
    TypeOrmModule.forFeature([AttemptEntity, ExamSessionEntity, ExamExtensionEntity]),
    ExamModule,
    CourseModule, // RegistrationService: the start-attempt registration gate
    UserModule, // student names on the monitoring screen
    ClientSecurityModule, // violation counts on the monitoring screen
  ],
  controllers: [AttemptController],
  providers: [
    AttemptService,
    TimerService,
    { provide: EXAM_LOOKUP_SERVICE, useClass: ExamLookupAdapter },
  ],
  exports: [AttemptService, TimerService],
})
export class AttemptModule {}
