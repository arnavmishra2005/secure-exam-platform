// Owner: Person A (Platform, Courses, Publish, Results)

import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { PublishExamDto } from '@secure-exam/validation';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PublishService } from './publish.service';

@ApiTags('publish')
@ApiBearerAuth()
@Controller('exams/:examId')
@Roles(Role.ADMIN)
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  @Get('publish-readiness')
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
