import { Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CaptchaService } from './captcha.service';
@Controller('auth/captcha')
export class CaptchaController {
  constructor(private readonly captcha: CaptchaService) {}
  @Post()
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create() { return this.captcha.create(); }
}
