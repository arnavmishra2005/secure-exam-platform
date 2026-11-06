import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityEventEntity } from '../client-security/entities/security-event.entity';
import { DockerRunnerProvider } from './docker-runner.provider';
import { EXECUTION_PROVIDER } from './execution-provider.interface';
import { RunLimiterService } from './run-limiter.service';
import { RunMonitorService } from './run-monitor.service';
import { SandboxReaperService } from './sandbox-reaper.service';
import { SecurityEventSuspiciousCodeSink, SUSPICIOUS_CODE_SINK } from './suspicious-code.sink';

/** Owner: Person B. Sandboxed code execution, used only by the coding module. */
@Module({
  imports: [TypeOrmModule.forFeature([SecurityEventEntity])],
  providers: [
    { provide: EXECUTION_PROVIDER, useClass: DockerRunnerProvider },
    RunLimiterService,
    RunMonitorService,
    SandboxReaperService,
    { provide: SUSPICIOUS_CODE_SINK, useClass: SecurityEventSuspiciousCodeSink },
  ],
  exports: [EXECUTION_PROVIDER, RunLimiterService],
})
export class ExecutionModule {}
