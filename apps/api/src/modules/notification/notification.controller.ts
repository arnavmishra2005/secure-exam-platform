// Owner: Person A (Platform, Courses, Publish, Results)
// The caller's own notifications. Any authenticated user may read theirs;
// the user id always comes from the JWT, never from the request.

import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@secure-exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.notificationService.listForUser(user.sub, limit ? Number(limit) || 50 : 50);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notificationService.markAllRead(user.sub);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationService.markRead(user.sub, id);
  }
}
