// Owner: Person A (Identity/Auth/Security)
// Pulls the authenticated user (attached by JwtAuthGuard) off the request.
// Usage: findAll(@CurrentUser() user: JwtPayload)

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@secure-exam/types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
