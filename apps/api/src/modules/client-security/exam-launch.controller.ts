// Owner: Person C (Electron, Kiosk & Security)

import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { CreateExamLaunchDto, ExamLaunchTokenDto } from '@secure-exam/validation';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DesktopClientGuard } from '../../common/guards/desktop-client.guard';
import { ExamLaunchService } from './exam-launch.service';

@ApiTags('exam-launch')
@Controller('auth/exam-launch')
export class ExamLaunchController {
  constructor(private readonly service: ExamLaunchService) {}

  /** Browser: the signed-in student asks to open an exam in the exam app. */
  @ApiBearerAuth()
  @Post()
  @Roles(Role.STUDENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() dto: CreateExamLaunchDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(user, dto.examId);
  }

  /** Exam app: whose launch link is this? Does not use the token up. */
  @Public()
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DesktopClientGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  preview(@Body() dto: ExamLaunchTokenDto) {
    return this.service.preview(dto.token);
  }

  /** Exam app: the student clicked Login. Uses the token up and returns a session. */
  @Public()
  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DesktopClientGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  redeem(@Body() dto: ExamLaunchTokenDto, @Req() req: Request) {
    return this.service.redeem(dto.token, req.ip ?? null);
  }
}
