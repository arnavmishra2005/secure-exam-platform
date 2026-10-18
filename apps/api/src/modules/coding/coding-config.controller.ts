import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, type CodingClientConfig } from '@secure-exam/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { codingClientConfig } from './coding-config';

/** Owner: Person B. Tells the exam app where code may run and how Submit behaves. */
@ApiTags('coding')
@ApiBearerAuth()
@Controller('coding')
export class CodingConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get('config')
  @Roles(Role.STUDENT, Role.ADMIN)
  get(): CodingClientConfig {
    return codingClientConfig(this.config);
  }
}
