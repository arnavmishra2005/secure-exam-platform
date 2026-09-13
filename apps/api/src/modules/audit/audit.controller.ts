// Owner: Person A (Identity/Auth/Security)
// Person C's admin-portal audit viewer screen calls this endpoint.

import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditEventType, Role } from '@secure-exam/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Supports both Person A's query params (type, actorId, limit, offset)
   * and Person C's richer filters (examId, attemptId, eventType, page).
   */
  @Get()
  @Roles(Role.ADMIN)
  @ApiQuery({ name: 'type', enum: AuditEventType, required: false })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'examId', required: false })
  @ApiQuery({ name: 'attemptId', required: false })
  @ApiQuery({ name: 'eventType', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  findAll(
    @Query('type') type?: AuditEventType,
    @Query('actorId') actorId?: string,
    @Query('examId') examId?: string,
    @Query('attemptId') attemptId?: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('page') page?: string,
  ) {
    if (offset !== undefined) {
      return this.auditService.findAll({
        type,
        actorId,
        limit: limit ? Number(limit) : undefined,
        offset: Number(offset),
      });
    }

    return this.auditService.listEvents({
      examId,
      attemptId,
      eventType: eventType ?? type,
      actorId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }
}