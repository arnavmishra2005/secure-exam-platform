// Owner: Person A (Identity/Auth/Security)
// Usable by any controller: @Roles('admin') / @Roles('admin', 'student')

import { SetMetadata } from '@nestjs/common';
import { Role } from '@secure-exam/types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
