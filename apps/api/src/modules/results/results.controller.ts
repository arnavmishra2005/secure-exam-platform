// Owner: Person A (Platform, Courses, Publish, Results)
// Person B adds GET /results/exams/:examId/questions (QuestionsTab) in their
// own question-analytics controller.

import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AccessService } from '../../common/access/access.service';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResultsService } from './results.service';

@ApiTags('results')
@ApiBearerAuth()
@Controller('results/exams')
@RequirePermission(Permission.RESULTS_VIEW, { exam: 'examId' })
export class ResultsController {
  constructor(
    private readonly resultsService: ResultsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  @RequirePermission(Permission.RESULTS_VIEW)
  async listExams(@CurrentUser() user: JwtPayload) {
    return this.resultsService.listExams(await this.access.courseIdsFor(user, Permission.RESULTS_VIEW));
  }

  @Get(':examId/overview')
  overview(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.resultsService.overview(examId);
  }

  @Get(':examId/students')
  students(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.resultsService.students(examId);
  }

  @Post(':examId/publish-results')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.RESULTS_PUBLISH, { exam: 'examId' })
  publishResults(@Param('examId', ParseUUIDPipe) examId: string, @CurrentUser() user: JwtPayload) {
    return this.resultsService.publishResults(examId, user.sub);
  }

  @Post(':examId/recompute')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.MARKS_ADJUST, { exam: 'examId' })
  recompute(@Param('examId', ParseUUIDPipe) examId: string, @CurrentUser() user: JwtPayload) {
    return this.resultsService.recompute(examId, user.sub);
  }
}
