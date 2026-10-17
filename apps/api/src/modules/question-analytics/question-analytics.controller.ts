import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@secure-exam/types';
import type { AttemptDrilldown, QuestionAnalyticsMatrix } from '@secure-exam/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { QuestionAnalyticsService } from './question-analytics.service';

/** Owner: Person B. Question-wise results (admin only: includes answer keys and hidden tests). */
@ApiTags('question-analytics')
@ApiBearerAuth()
@Controller('exams/:examId/question-analytics')
@Roles(Role.ADMIN)
export class QuestionAnalyticsController {
  constructor(private readonly analytics: QuestionAnalyticsService) {}

  /** Students × questions matrix with per-question stats. */
  @Get()
  matrix(@Param('examId', ParseUUIDPipe) examId: string): Promise<QuestionAnalyticsMatrix> {
    return this.analytics.matrix(examId);
  }

  /** One attempt: every question with the selected options or the code and test results. */
  @Get('attempts/:attemptId')
  drilldown(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ): Promise<AttemptDrilldown> {
    return this.analytics.drilldown(examId, attemptId);
  }
}
