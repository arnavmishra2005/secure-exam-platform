/**
 * Owner: Person B. Execution-mode settings, read once from the environment.
 * Rationale and how to change them: "Decision log" in person_b_plan.md.
 */
import { ConfigService } from '@nestjs/config';
import { CodingGradingMode, type CodingClientConfig } from '@secure-exam/types';

export function codingClientConfig(config: ConfigService): CodingClientConfig {
  const mode = config.get<string>('CODING_GRADING_MODE') === 'LIVE' ? CodingGradingMode.LIVE : CodingGradingMode.DEFERRED;
  const explicit = config.get<string | boolean>('CODING_SERVER_RUN');
  const serverRunEnabled =
    explicit === undefined || explicit === ''
      ? config.get<string>('NODE_ENV') !== 'production'
      : explicit === true || explicit === 'true';
  return { gradingMode: mode, serverRunEnabled };
}
