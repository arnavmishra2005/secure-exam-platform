import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubmissionService } from './submission.service';

/**
 * Owner: Person C.
 *
 * Defense in depth alongside the lazy auto-submit already built into
 * `SubmissionService.assertAttemptIsWritable()`/`submit()`: periodically
 * finds IN_PROGRESS attempts whose `expiresAt` has already passed and
 * finalizes them as AUTO_SUBMITTED, even if nobody ever calls the API for
 * that attempt again. Without this, an abandoned attempt (student closes
 * the tab and never comes back) stays IN_PROGRESS in the DB forever —
 * accurate to "nothing has touched it since," but misleading on a
 * monitoring screen and wrong for reporting.
 *
 * Genuinely NEW dependency, not something already assumed to exist from
 * Day 0 — see the README's "minimal shared-file changes" for the one-line
 * `ScheduleModule.forRoot()` addition this needs in `app.module.ts`, and
 * add `@nestjs/schedule` to apps/api's package.json.
 *
 * Interval is intentionally short-ish (30s) so the gap between an
 * attempt's real expiry and its DB status being corrected stays small;
 * tune via the `@Cron` expression below if that's too chatty for a large
 * deployment (e.g. `CronExpression.EVERY_MINUTE`).
 */
@Injectable()
export class AttemptExpirySweepService {
  private readonly logger = new Logger(AttemptExpirySweepService.name);

  constructor(private readonly submissionService: SubmissionService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweep(): Promise<void> {
    const { sweptCount, failedCount } = await this.submissionService.sweepExpiredAttempts();
    if (sweptCount > 0 || failedCount > 0) {
      this.logger.log(`Expiry sweep: auto-submitted ${sweptCount} attempt(s), ${failedCount} failure(s)`);
    }
  }
}
