import { Body, Controller, Get, Headers, Ip, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
// Person A's real guards and decorators:
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { ListAttemptsQueryDto, StartAttemptDto } from '@secure-exam/validation';
import { AttemptService } from './attempt.service';

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  /** Admin-only: powers the /monitoring screen. */
  @Get()
  @Roles(Role.ADMIN)
  list(@Query() query: ListAttemptsQueryDto) {
    return this.attemptService.listForMonitoring(query);
  }

  @Get(':id')
  @Roles(Role.STUDENT, Role.ADMIN)
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.attemptService.getAttemptById(id, user);
  }

  @Post()
  @Roles(Role.STUDENT)
  start(@Body() dto: StartAttemptDto, @CurrentUser() user: JwtPayload) {
    return this.attemptService.startAttempt(user, dto);
  }

  /**
   * Lightweight liveness ping the exam UI can call periodically so the
   * admin monitoring screen can tell an actively-connected attempt apart
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
