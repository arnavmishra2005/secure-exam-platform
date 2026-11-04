// Owner: Person A (Platform, Courses, Publish, Results)

import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { PublishExamDto } from '@secure-exam/validation';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PublishService } from './publish.service';

@ApiTags('publish')
@ApiBearerAuth()
@Controller('exams/:examId')
@RequirePermission(Permission.EXAM_EDIT, { exam: 'examId' })
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  @Get('publish-readiness')
  @RequirePermission(Permission.EXAM_VIEW, { exam: 'examId' })
  readiness(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.publishService.readiness(examId);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: PublishExamDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.publishService.publish(examId, dto, user.sub);
  }
}
