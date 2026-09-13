// Owner: Person A (Identity/Auth/Security)
// Marked @Global so Person B and Person C's modules can inject AuditService
// without each of them re-importing AuditModule individually.

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditEventEntity } from './entities/audit-event.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditEventEntity])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
