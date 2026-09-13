import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@secure-exam/types';

/**
 * Local stand-in for a shared `@CurrentUser()` decorator. Reads the user
 * that Person A's JwtStrategy attaches to the request (`req.user`),
 * assumed to match `JwtPayload` from `@secure-exam/types` (fields: at
 * least `sub` = user id, `role` = Role).
 *
 * INTEGRATION: if Person A publishes an equivalent decorator under
 * `common/decorators/current-user.decorator.ts`, delete this file and
 * update the two imports in attempt.controller.ts / answer.controller.ts /
 * submission.controller.ts to point there instead — nothing else changes.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as JwtPayload;
});
