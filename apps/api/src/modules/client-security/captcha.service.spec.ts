import { createHash } from 'crypto';
import { CaptchaService } from './captcha.service';
import * as svgCaptcha from 'svg-captcha';
jest.mock('svg-captcha', () => ({ create: jest.fn(() => ({ text: 'AbC23', data: '<svg/>' })) }));

describe('CaptchaService', () => {
  function setup() {
    const rows = new Map<string, any>();
    let id: string;
    const qb: Record<string, jest.Mock> = { delete: jest.fn().mockReturnThis(), where: jest.fn((_sql, params) => { id = params.id; return qb; }), returning: jest.fn().mockReturnThis(), execute: jest.fn(async () => { const row = rows.get(id); rows.delete(id); return { raw: row ? [row] : [] }; }) };
    const repo = { insert: jest.fn(async row => rows.set(row.id, row)), createQueryBuilder: () => qb, delete: jest.fn() };
    return { service: new CaptchaService(repo as never), rows, repo };
  }
  it('stores a salted hash, accepts normalized text once, and replaces a replayed challenge', async () => {
    const { service, rows } = setup();
    const challenge = await service.create();
    expect(challenge).toEqual({ captchaId: expect.any(String), svg: '<svg/>' });
    expect(rows.get(challenge.captchaId).answerHash).toBe(createHash('sha256').update(`${challenge.captchaId}:abc23`).digest('hex'));
    expect(JSON.stringify([...rows.values()])).not.toContain('AbC23');
    await service.consume(challenge.captchaId, ' ABC23 ');
    await expect(service.consume(challenge.captchaId, 'abc23')).rejects.toMatchObject({ response: { code: 'CAPTCHA_INVALID', captcha: { svg: '<svg/>' } } });
  });
  it.each(['wrong', 'expired'])('consumes a %s challenge and issues a new one', async mode => {
    const { service, rows } = setup();
    const challenge = await service.create();
    if (mode === 'expired') rows.get(challenge.captchaId).expiresAt = new Date(0);
    await expect(service.consume(challenge.captchaId, mode === 'wrong' ? 'bad' : 'abc23')).rejects.toMatchObject({ response: { code: 'CAPTCHA_INVALID' } });
    expect(rows.has(challenge.captchaId)).toBe(false);
    expect(svgCaptcha.create).toHaveBeenCalled();
  });
});
