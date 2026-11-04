import { Body, Controller, Get, Headers, Ip, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
// Person A's real guards and decorators:
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission, Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AccessService } from '../../common/access/access.service';
import { RequirePermission, StaffAccess } from '../../common/access/require-permission.decorator';
import { ListAttemptsQueryDto, StartAttemptDto } from '@secure-exam/validation';
import { DesktopClientGuard } from '../../common/guards/desktop-client.guard';
import { AttemptService } from './attempt.service';

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttemptController {
  constructor(
    private readonly attemptService: AttemptService,
    private readonly access: AccessService,
  ) {}

  /** Staff: powers the /monitoring screen, limited to exams the caller may monitor. */
  @Get()
  @RequirePermission(Permission.MONITOR)
  async list(@Query() query: ListAttemptsQueryDto, @CurrentUser() user: JwtPayload) {
    if (query.examId) await this.access.assertExam(user, query.examId, Permission.MONITOR);
    return this.attemptService.listForMonitoring(query, await this.access.examIdsFor(user, Permission.MONITOR));
  }

  /** The caller's own attempt at an exam, for resuming it. Declared before ':id' so it isn't parsed as one. */
  @Get('current')
  @Roles(Role.STUDENT)
  current(@Query('examId', ParseUUIDPipe) examId: string, @CurrentUser() user: JwtPayload) {
    return this.attemptService.findMyAttemptForExam(examId, user);
  }

  @Get(':id')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.TA)
  @StaffAccess(Permission.MONITOR, { attempt: 'id' })
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.attemptService.getAttemptById(id, user);
  }

  @Post()
  @Roles(Role.STUDENT)
  @UseGuards(DesktopClientGuard) // exams are started from the exam app only
  start(@Body() dto: StartAttemptDto, @CurrentUser() user: JwtPayload) {
    return this.attemptService.startAttempt(user, dto);
  }

  /**
   * Lightweight liveness ping the exam UI can call periodically so the
   * staff monitoring screen can tell an actively-connected attempt apart
   * from one that's gone quiet.
   */
  @Post(':id/heartbeat')
  @Roles(Role.STUDENT)
  heartbeat(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.attemptService.heartbeat(id, user, { ipAddress: ip, userAgent });
  }
}
