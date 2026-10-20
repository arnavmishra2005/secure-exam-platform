// Owner: Person A (Platform, Courses, Publish, Results)
// Person B adds GET /results/exams/:examId/questions (QuestionsTab) in their
// own question-analytics controller.

import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ResultsService } from './results.service';

@ApiTags('results')
@ApiBearerAuth()
@Controller('results/exams')
@Roles(Role.ADMIN)
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get()
  listExams() {
    return this.resultsService.listExams();
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
  publishResults(@Param('examId', ParseUUIDPipe) examId: string, @CurrentUser() user: JwtPayload) {
    return this.resultsService.publishResults(examId, user.sub);
  }

  @Post(':examId/recompute')
  @HttpCode(HttpStatus.OK)
  recompute(@Param('examId', ParseUUIDPipe) examId: string, @CurrentUser() user: JwtPayload) {
    return this.resultsService.recompute(examId, user.sub);
  }
}
