import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission, Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AccessService } from '../../common/access/access.service';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import {
  ListSubmissionsQueryDto,
  OverrideResultScoreDto,
  PublishResultDto,
  SubmitAttemptDto,
} from '@secure-exam/validation';
import { DesktopClientGuard } from '../../common/guards/desktop-client.guard';
import { SubmissionService } from './submission.service';

/** Student-facing: POST /attempts/:id/submit — matches the documented route exactly. */
@ApiTags('submissions')
@ApiBearerAuth()
@Controller('attempts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Post(':id/submit')
  @Roles(Role.STUDENT)
  @UseGuards(DesktopClientGuard)
  submit(
    @Param('id', ParseUUIDPipe) attemptId: string,
    @Body() dto: SubmitAttemptDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.submissionService.submit(attemptId, user, dto);
  }
}

/**
 * Staff "Submissions list + result publishing screen" routes, kept in
 * a separate controller (same file, distinct base path) so `/submissions`
 * never collides with the `:id` param route above.
 */
@Controller('submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermission(Permission.RESULTS_PUBLISH, { attempt: 'attemptId' })
export class SubmissionStaffController {
  constructor(
    private readonly submissionService: SubmissionService,
    private readonly access: AccessService,
  ) {}

  @Get()
  @RequirePermission(Permission.RESULTS_VIEW)
  async list(@Query() query: ListSubmissionsQueryDto, @CurrentUser() user: JwtPayload) {
    if (query.examId) await this.access.assertExam(user, query.examId, Permission.RESULTS_VIEW);
    return this.submissionService.listSubmissions({
      ...query,
      examIds: await this.access.examIdsFor(user, Permission.RESULTS_VIEW),
    });
  }

  @Get(':attemptId/result')
  @RequirePermission(Permission.RESULTS_VIEW, { attempt: 'attemptId' })
  getResult(@Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.submissionService.getResultForAttempt(attemptId);
  }

  @Patch(':attemptId/result')
  @RequirePermission(Permission.MARKS_ADJUST, { attempt: 'attemptId' })
  overrideScore(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: OverrideResultScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.submissionService.overrideScore(attemptId, dto.score, user.sub);
  }

  @Post(':attemptId/result/publish')
  publish(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: PublishResultDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.submissionService.setPublished(attemptId, dto.publish ?? true, user.sub);
  }

  @Post(':attemptId/result/unpublish')
  unpublish(@Param('attemptId', ParseUUIDPipe) attemptId: string, @CurrentUser() user: JwtPayload) {
    return this.submissionService.setPublished(attemptId, false, user.sub);
  }
}
