// Owner: Person A (Identity/Auth/Security)
// The signed-in staff member's courses and permissions, so the web app can
// show only the menus and buttons they may use. The API checks every request
// regardless.

import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES } from '@secure-exam/types';
import type { JwtPayload, MyAccess } from '@secure-exam/types';
import { AccessService } from '../../common/access/access.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('access')
@ApiBearerAuth()
@Controller('me')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get('access')
  @Roles(...STAFF_ROLES)
  myAccess(@CurrentUser() user: JwtPayload): Promise<MyAccess> {
    return this.access.myAccess(user);
  }
}
