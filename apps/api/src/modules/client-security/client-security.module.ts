// Owner: Person C (Electron, Kiosk & Security)

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { ClientSecurityController } from './client-security.controller';
import { ClientSecurityService } from './client-security.service';
import { ExamLaunchController } from './exam-launch.controller';
import { ExamLaunchService } from './exam-launch.service';
import { ExamLaunchTokenEntity } from './entities/exam-launch-token.entity';
import { SecurityEventEntity } from './entities/security-event.entity';

// AttemptEntity is read by id only, to check that an attempt belongs to the caller.
@Module({
  imports: [TypeOrmModule.forFeature([SecurityEventEntity, ExamLaunchTokenEntity, AttemptEntity]), AuthModule, UserModule],
  controllers: [ClientSecurityController, ExamLaunchController],
  providers: [ClientSecurityService, ExamLaunchService],
  exports: [ClientSecurityService],
})
export class ClientSecurityModule {}
