// Owner: Person C (Electron, Kiosk & Security)

import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { ReportSecurityEventsDto } from '@secure-exam/validation';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ClientSecurityService } from './client-security.service';

@ApiTags('client-security')
@ApiBearerAuth()
@Controller('attempts/:attemptId/events')
export class ClientSecurityController {
  constructor(private readonly service: ClientSecurityService) {}

  /** The exam app reports violations for the student's own attempt. */
  @Post()
  @Roles(Role.STUDENT)
  @HttpCode(HttpStatus.OK)
  report(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: ReportSecurityEventsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.record(attemptId, user, dto);
  }

  /** What an admin sees when they open an attempt's violations. */
  @Get()
  @Roles(Role.ADMIN)
  list(@Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.service.list(attemptId);
  }
}
