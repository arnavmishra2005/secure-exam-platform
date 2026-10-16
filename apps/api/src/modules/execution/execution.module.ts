import { Module } from '@nestjs/common';
import { DockerRunnerProvider } from './docker-runner.provider';
import { EXECUTION_PROVIDER } from './execution-provider.interface';

/** Owner: Person B. Sandboxed code execution, used only by the coding module. */
@Module({
  providers: [{ provide: EXECUTION_PROVIDER, useClass: DockerRunnerProvider }],
  exports: [EXECUTION_PROVIDER],
})
export class ExecutionModule {}
