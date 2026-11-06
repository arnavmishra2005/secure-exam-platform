// Owner: Person A (Identity/Auth/Security)
// Person C's staff-portal audit viewer screen calls this endpoint.

import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditEventType, Permission } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AccessService } from '../../common/access/access.service';
import { RequirePermission } from '../../common/access/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly access: AccessService,
  ) {}

  /**
   * Supports both Person A's query params (type, actorId, limit, offset)
   * and Person C's richer filters (examId, attemptId, eventType, page).
   * Staff see the events of exams they may monitor, plus their own actions.
   */
  @Get()
  @RequirePermission(Permission.MONITOR)
  @ApiQuery({ name: 'type', enum: AuditEventType, required: false })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'examId', required: false })
  @ApiQuery({ name: 'attemptId', required: false })
  @ApiQuery({ name: 'eventType', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('type') type?: AuditEventType,
    @Query('actorId') actorId?: string,
    @Query('examId') examId?: string,
    @Query('attemptId') attemptId?: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('page') page?: string,
  ) {
    const scope = { examIds: await this.access.examIdsFor(user, Permission.MONITOR), selfId: user.sub };
    if (offset !== undefined) {
      return this.auditService.findAll({
        type,
        actorId,
        limit: limit ? Number(limit) : undefined,
        offset: Number(offset),
        scope,
      });
    }

    return this.auditService.listEvents({
      scope,
      examId,
      attemptId,
      eventType: eventType ?? type,
      actorId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }
}