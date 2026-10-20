/**
 * Owner: Person C (Time Extension, Dashboard)
 */

import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { ExtendTimeDto } from '@secure-exam/validation';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ExtensionService } from './extension.service';

@ApiTags('extensions')
@ApiBearerAuth()
@Controller('exams/:examId/extensions')
@Roles(Role.ADMIN)
export class ExtensionController {
  constructor(private readonly extensionService: ExtensionService) {}

  @Get()
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
