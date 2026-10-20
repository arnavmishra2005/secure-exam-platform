/**
 * Owner: Person B (Code Runner)
 *
 * CONTRACT ONLY (Day 1 morning). Person B implements DockerRunnerProvider
 * against this interface; a Judge0 provider can be swapped in later by
 * adding one class and changing the EXECUTION_PROVIDER binding.
 *
 * Not imported by AppModule yet — Person B adds CodeRunnerModule on Day 2.
 */

import type { CodeLanguage, CodeRunStatus } from '@secure-exam/types';

export const EXECUTION_PROVIDER = Symbol('EXECUTION_PROVIDER');

export interface ExecutionRequest {
  language: CodeLanguage;
  source: string;
  stdin: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface ExecutionResult {
  status: CodeRunStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  /** True when stdout/stderr were cut at the output cap. */
  truncated: boolean;
}

export interface ExecutionProvider {
  readonly name: string;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  /** Cheap readiness check (image pulled, daemon reachable). */
  healthCheck(): Promise<boolean>;
}
