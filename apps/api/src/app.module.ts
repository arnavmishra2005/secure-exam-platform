// [SHARED, small additive edits only] — each person adds their own module
// to the `imports` array in a one-line PR; nothing else here should change
// often.

import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from './common/config/config.module';
import { HealthController } from './common/health/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditLoggingInterceptor } from './common/interceptors/audit-logging.interceptor';
import { AuditEventEntity } from './modules/audit/entities/audit-event.entity';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { StudentEntity } from './modules/user/entities/student.entity';
import { UserEntity } from './modules/user/entities/user.entity';
import { UserModule } from './modules/user/user.module';
import { ExamModule } from './modules/exam/exam.module';
import { QuestionModule } from './modules/question/question.module';
import { CodingModule } from './modules/coding/coding.module';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { QuestionAnalyticsModule } from './modules/question-analytics/question-analytics.module';
import { AttemptModule } from './modules/attempt/attempt.module';
import { AnswerModule } from './modules/answer/answer.module';
import { CourseModule } from './modules/course/course.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PublishModule } from './modules/publish/publish.module';
import { ResultsModule } from './modules/results/results.module';
import { ExtensionModule } from './modules/extension/extension.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule, // validated env, isGlobal

    ScheduleModule.forRoot(), // Required by AttemptExpirySweepService (@Cron)

    // Day 1 contract: domain events (common/events/events.ts).
    EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false }),

    TypeOrmModule.forRootAsync({
      imports: [NestConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [UserEntity, StudentEntity, AuditEventEntity],
        // autoLoadEntities picks up entities registered in each module's
        // TypeOrmModule.forFeature(), so we don't have to list them all here.
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        autoLoadEntities: true,
      }),
    }),

    ThrottlerModule.forRootAsync({
      imports: [NestConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL')! * 1000,
          limit: config.get<number>('THROTTLE_LIMIT')!,
        },
      ],
    }),

    AuditModule,    // @Global — exports AuditService for all modules
    AuthModule,
    UserModule,

    // Person B modules
    ExamModule,
    QuestionModule,
    CodingModule,
    QuestionBankModule,
    QuestionAnalyticsModule,

    // Person C modules
    AttemptModule,
    AnswerModule,

    // Phase 4 — Person A
    CourseModule,
    NotificationModule,
    PublishModule,
    ResultsModule, // @Global: provides SCORE_RECORDER

    // Phase 4 — Person C
    ExtensionModule,
    DashboardModule,
  ],
  providers: [
    // Rate limiting on every route by default.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every controller requires a valid JWT unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Every controller enforces @Roles() where present.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Auto-fires AuditService.logEvent() for handlers tagged @AuditLog(type).
    { provide: APP_INTERCEPTOR, useClass: AuditLoggingInterceptor },
  ],
})
export class AppModule {}
