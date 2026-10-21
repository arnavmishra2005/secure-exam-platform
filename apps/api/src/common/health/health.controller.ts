// Liveness probe. The exam app's readiness check pings it before a student starts.

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @SkipThrottle()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
