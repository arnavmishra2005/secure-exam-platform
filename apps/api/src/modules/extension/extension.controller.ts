/**
 * Owner: Person C (Time Extension, Dashboard)
 */

import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { ExtendTimeDto } from '@secure-exam/validation';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExtensionService } from './extension.service';

@ApiTags('extensions')
@ApiBearerAuth()
@Controller('exams/:examId/extensions')
@RequirePermission(Permission.EXTEND_TIME, { exam: 'examId' })
export class ExtensionController {
  constructor(private readonly extensionService: ExtensionService) {}

  @Get()
  @RequirePermission(Permission.MONITOR, { exam: 'examId' })
  list(@Param('examId', ParseUUIDPipe) examId: string) {
    return this.extensionService.listForExam(examId);
  }

  /** Omit studentId to extend the whole exam. */
  @Post()
  extend(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: ExtendTimeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.extensionService.extend(examId, dto, user.sub);
  }
}
