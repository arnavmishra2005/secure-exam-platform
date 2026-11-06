// Owner: Person A (Identity/Auth/Security)
// @Global so every module can inject AccessService to scope lists and check
// records named in a request body.

import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { PermissionGuard } from './permission.guard';

@Global()
@Module({
  providers: [AccessService, PermissionGuard],
  exports: [AccessService, PermissionGuard],
})
export class AccessModule {}
