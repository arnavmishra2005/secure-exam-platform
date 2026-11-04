// Owner: Person A (Identity/Auth/Security)
// Declares what a staff route needs; PermissionGuard enforces it.
//
//   @RequirePermission(Permission.EXAM_EDIT, { exam: 'examId' })
//     staff only; must hold EXAM_EDIT on the course that owns :examId
//   @RequirePermission(Permission.EXAM_VIEW)
//     staff only; a TA must hold EXAM_VIEW on some course (lists then filter
//     by AccessService.courseIdsFor in the handler)
//   @RequireCourseStaff({ course: 'id' })            any instructor or TA of :id
//   @RequireCourseStaff({ course: 'id' }, { instructorOnly: true })
//   @StaffAccess(Permission.MONITOR, { attempt: 'id' })
//     for routes students use too (with @Roles(STUDENT, INSTRUCTOR, TA)):
//     applies only when the caller is staff

import { applyDecorators, SetMetadata } from '@nestjs/common';
import { Permission, STAFF_ROLES } from '@secure-exam/types';
import { Roles } from '../decorators/roles.decorator';
import type { AccessResourceKind } from './access.service';

/** `{ exam: 'examId' }`: the route parameter that names the record. */
export type AccessResource = Partial<Record<AccessResourceKind, string>>;

export interface StaffAccessRule {
  permission?: Permission;
  instructorOnly?: boolean;
  resource?: AccessResource;
}

export const STAFF_ACCESS_KEY = 'staffAccess';

/** The access rule only, without restricting roles. */
export const StaffAccess = (permission: Permission | undefined, resource?: AccessResource) =>
  SetMetadata(STAFF_ACCESS_KEY, { permission, resource } satisfies StaffAccessRule);

/** Staff only (instructors and TAs), needing `permission`, on `resource` when given. */
export const RequirePermission = (permission: Permission, resource?: AccessResource) =>
  applyDecorators(Roles(...STAFF_ROLES), StaffAccess(permission, resource));

/** Staff of the named course (any role), or only its instructors. */
export const RequireCourseStaff = (resource: { course: string }, options: { instructorOnly?: boolean } = {}) =>
  applyDecorators(
    Roles(...STAFF_ROLES),
    SetMetadata(STAFF_ACCESS_KEY, { resource, instructorOnly: options.instructorOnly } satisfies StaffAccessRule),
  );
