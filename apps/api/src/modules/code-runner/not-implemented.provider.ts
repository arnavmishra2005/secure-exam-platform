/**
 * Owner: Person B (Code Runner)
 *
 * CONTRACT STUB (Day 1 morning). Bound to EXECUTION_PROVIDER until
 * DockerRunnerProvider exists, so code depending on the interface compiles
 * and fails loudly instead of silently grading everything as zero.
 */

import { Injectable, NotImplementedException } from '@nestjs/common';
import type { ExecutionProvider, ExecutionRequest, ExecutionResult } from './execution-provider.interface';

@Injectable()
export class NotImplementedExecutionProvider implements ExecutionProvider {
  readonly name = 'not-implemented';

  async execute(_request: ExecutionRequest): Promise<ExecutionResult> {
    throw new NotImplementedException('The code runner is not available yet');
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }
}
