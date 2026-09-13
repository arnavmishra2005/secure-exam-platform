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

// Note: AuditModule is @Global() in Person A's AppModule, so AuditService
// is available to AttemptService via DI without re-importing AuditModule here.

@Module({
  imports: [
    TypeOrmModule.forFeature([AttemptEntity, ExamSessionEntity]),
    ExamModule,
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
