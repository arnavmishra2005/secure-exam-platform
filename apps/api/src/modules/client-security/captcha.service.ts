import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Repository, LessThan } from 'typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import * as svgCaptcha from 'svg-captcha';
import { CaptchaEntity } from './entities/captcha.entity';

const digest = (id: string, answer: string) => createHash('sha256').update(`${id}:${answer.trim().toLowerCase()}`).digest('hex');
@Injectable()
export class CaptchaService {
  constructor(@InjectRepository(CaptchaEntity) private readonly repo: Repository<CaptchaEntity>) {}
  async create() {
    const image = svgCaptcha.create({ size: 5, noise: 3, color: false, background: '#ffffff', ignoreChars: '0oO1ilI' });
    const captchaId = randomUUID();
    await this.repo.insert({ id: captchaId, answerHash: digest(captchaId, image.text), expiresAt: new Date(Date.now() + 120_000) });
    return { captchaId, svg: image.data };
  }
  async consume(id: string, answer: string): Promise<void> {
    // Delete + RETURNING is atomic across API processes. Even wrong answers consume the challenge.
    const result = await this.repo.createQueryBuilder().delete().where('id = :id', { id }).returning('*').execute();
    const row = result.raw[0] as CaptchaEntity | undefined;
    if (!row || new Date(row.expiresAt).getTime() <= Date.now() ||
        !timingSafeEqual(Buffer.from(row.answerHash, 'hex'), Buffer.from(digest(id, answer), 'hex'))) {
      throw new BadRequestException({ message: 'Captcha is incorrect or expired. Try the new image.', code: 'CAPTCHA_INVALID', captcha: await this.create() });
    }
  }
  @Interval(60_000)
  async cleanup() { await this.repo.delete({ expiresAt: LessThan(new Date()) }); }
}
