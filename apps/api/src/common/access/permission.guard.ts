// Owner: Person A (Identity/Auth/Security)
// Runs after RolesGuard. Enforces @RequirePermission / @RequireCourseStaff /
// @StaffAccess for instructors and TAs; students are left to @Roles and to
// the services' own ownership checks.

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AccessService, type AccessResourceKind } from './access.service';
import { STAFF_ACCESS_KEY, type StaffAccessRule } from './require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<StaffAccessRule | undefined>(STAFF_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload; params: Record<string, string> }>();
    const user = request.user;
    if (!user || !this.access.isStaff(user)) return true;

    const entry = rule.resource ? Object.entries(rule.resource)[0] : undefined;
    if (entry) {
      const [kind, param] = entry as [AccessResourceKind, string];
      await this.access.assertResource(user, kind, request.params[param], rule.permission, rule.instructorOnly);
      return true;
    }

    // No record named: an instructor may always proceed (lists come back
    // empty, creation checks the course in the body). A TA needs the
    // permission on at least one course.
    if (rule.permission && user.role === Role.TA && !(await this.access.hasAnywhere(user, rule.permission))) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}
