/**
 * Owner: Person B.
 *
 * The only way the app executes untrusted code. Today it is backed by
 * DockerRunnerProvider (one throw-away container per run); a Judge0 or
 * worker-pool provider can replace it later without touching callers.
 */

import type { CodeLanguage, ExecutionOutcome } from '@secure-exam/types';

export const EXECUTION_PROVIDER = Symbol('EXECUTION_PROVIDER');

export interface ExecutionLimits {
  /** Wall-clock limit for ONE execution of the program (per input). */
  timeLimitMs: number;
  memoryLimitMb: number;
}

/** Who and what a run is for: used only for run logs and suspicious-code flags. */
export interface RunContext {
  /** RUN = Run / Run samples on the server; SUBMIT = live grading; GRADING = after the attempt; VALIDATION = "Test reference solution". */
  source: 'RUN' | 'SUBMIT' | 'GRADING' | 'REGRADE' | 'VALIDATION';
  /** users.id of whoever's code it is (the student, or the author for VALIDATION). */
  userId: string;
  attemptId?: string;
  examId?: string;
  questionId?: string;
}

export interface BatchExecutionJob {
  language: CodeLanguage;
  code: string;
  /** The program runs once per input, in order, inside one sandbox. */
  inputs: string[];
  limits: ExecutionLimits;
  context?: RunContext;
}

export interface ExecutionProvider {
  /**
   * Runs `code` once per input. Always resolves with one outcome per input;
   * sandbox failures come back as `INTERNAL_ERROR` outcomes, never as throws.
   */
  runBatch(job: BatchExecutionJob): Promise<ExecutionOutcome[]>;
}
