// Owner: Person A (Identity/Auth/Security)
// Optional convenience: tag a handler with @AuditLog('EXAM_CREATED') and the
// AuditLoggingInterceptor will call AuditService.logEvent() automatically
// after a successful response. Modules can also call AuditService directly
// when they need custom metadata — both styles are supported.

import { SetMetadata } from '@nestjs/common';
import { AuditEventType } from '@secure-exam/types';

export const AUDIT_EVENT_KEY = 'auditEvent';
export const AuditLog = (type: AuditEventType) => SetMetadata(AUDIT_EVENT_KEY, type);
