/**
 * Owner: Person C (Time Extension, Dashboard)
 */

import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@Roles(Role.STUDENT)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getDashboard(user.sub);
  }

  @Get('exams/:examId')
  exam(@CurrentUser() user: JwtPayload, @Param('examId', ParseUUIDPipe) examId: string) {
    return this.dashboardService.getExam(user.sub, examId);
  }
}
