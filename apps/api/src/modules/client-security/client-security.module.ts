// Owner: Person C (Electron, Kiosk & Security)

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { ClientSecurityController } from './client-security.controller';
import { ClientSecurityService } from './client-security.service';
import { SecurityEventEntity } from './entities/security-event.entity';

// AttemptEntity is read by id only, to check that an attempt belongs to the caller.
@Module({
  imports: [TypeOrmModule.forFeature([SecurityEventEntity, AttemptEntity])],
  controllers: [ClientSecurityController],
  providers: [ClientSecurityService],
  exports: [ClientSecurityService],
})
export class ClientSecurityModule {}
