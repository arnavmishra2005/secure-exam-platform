// Owner: Person A (Identity/Auth/Security)
// Usable by any controller: @Roles(Role.STUDENT) / @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.TA).
// For staff routes prefer @RequirePermission (common/access), which also checks the course.

import { SetMetadata } from '@nestjs/common';
import { Role } from '@secure-exam/types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
