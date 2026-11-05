import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@secure-exam/types';
import type { AdjustQuestionScoreResponse, AttemptDrilldown, JwtPayload, QuestionAnalyticsMatrix } from '@secure-exam/types';
import { AdjustQuestionScoreDto } from '@secure-exam/validation';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { QuestionAnalyticsService } from './question-analytics.service';
import { ScoreAdjustmentService } from './score-adjustment.service';

/** Owner: Person B. Question-wise results (admin only: includes answer keys and hidden tests). */
@ApiTags('question-analytics')
@ApiBearerAuth()
@Controller('exams/:examId/question-analytics')
@Roles(Role.ADMIN)
export class QuestionAnalyticsController {
  constructor(
    private readonly analytics: QuestionAnalyticsService,
    private readonly adjustments: ScoreAdjustmentService,
  ) {}

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

  /**
   * Manual mark adjustment for one question (#13): `{ score | adjustment, reason }`.
   * Admin only for now; MARKS_ADJUST on the exam's course after Person A's #1.
   */
  @Patch('attempts/:attemptId/questions/:questionId/score')
  adjustScore(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: AdjustQuestionScoreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdjustQuestionScoreResponse> {
    return this.adjustments.adjust(examId, attemptId, questionId, dto, user.sub);
  }
}
