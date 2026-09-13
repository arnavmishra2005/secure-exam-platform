// Owner: Person A (Identity/Auth/Security)
// Marks a route as not requiring authentication (e.g. POST /auth/login).
// The global JwtAuthGuard checks for this metadata and skips itself.

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
