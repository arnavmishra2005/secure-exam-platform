import { Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';

/**
 * Owner: Person C.
 *
 * Every C-owned call site logs audit events through this instead of calling
 * `auditService.logEvent(...)` directly, so a failure in Person A's
 * AuditService consistently never aborts or masks the outcome of the
 * action being audited.
 */
export async function logAuditSafely(
  logger: Logger,
  auditService: AuditService,
  type: string,
  metadata: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  try {
    await auditService.logEvent(type, metadata, actorId);
  } catch (err) {
    logger.error(
      `Audit logging failed for event "${type}" (actor ${actorId}): the underlying action itself already succeeded`,
      err instanceof Error ? err.stack : undefined,
    );
  }
}
