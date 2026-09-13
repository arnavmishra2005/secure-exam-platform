// Owner: Person A (Identity/Auth/Security)
// Applied globally. Looks for @AuditLog(type) metadata on the handler; if
// present, fires AuditService.logEvent() once the request completes
// successfully. Modules that need richer metadata than "it succeeded" should
// call AuditService.logEvent() directly from their service instead — this
// interceptor is a convenience, not the only path to an audit trail.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_EVENT_KEY } from '../decorators/audit-log.decorator';
import { AuditService } from '../../modules/audit/audit.service';

@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const eventType = this.reflector.getAllAndOverride<string>(AUDIT_EVENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!eventType) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const actorId: string | null = request.user?.sub ?? null;
    const ipAddress: string | null = request.ip ?? null;

    return next.handle().pipe(
      tap(() => {
        void this.auditService.logEvent(eventType as never, {
          path: request.url,
          method: request.method,
        }, actorId, ipAddress);
      }),
    );
  }
}
