import { Module } from '@nestjs/common';
import { DockerRunnerProvider } from './docker-runner.provider';
import { EXECUTION_PROVIDER } from './execution-provider.interface';
import { RunLimiterService } from './run-limiter.service';

/** Owner: Person B. Sandboxed code execution, used only by the coding module. */
@Module({
  providers: [{ provide: EXECUTION_PROVIDER, useClass: DockerRunnerProvider }, RunLimiterService],
  exports: [EXECUTION_PROVIDER, RunLimiterService],
})
export class ExecutionModule {}
