import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DesktopClientGuard } from './desktop-client.guard';

function contextWith(header?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ header: (name: string) => (name === 'x-client-type' ? header : undefined) }) }),
  } as never;
}
const guardWith = (required: unknown) =>
  new DesktopClientGuard({ get: jest.fn().mockReturnValue(required) } as unknown as ConfigService);

describe('DesktopClientGuard', () => {
  it('lets the exam app through', () => {
    expect(guardWith(true).canActivate(contextWith('DESKTOP'))).toBe(true);
    expect(guardWith(true).canActivate(contextWith('desktop'))).toBe(true);
  });

  it('refuses a browser, or a request with no client type', () => {
    expect(() => guardWith(true).canActivate(contextWith('WEB'))).toThrow(ForbiddenException);
    expect(() => guardWith(true).canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });

  it('is required unless it is explicitly switched off', () => {
    expect(() => guardWith(undefined).canActivate(contextWith(undefined))).toThrow(ForbiddenException);
    expect(guardWith(false).canActivate(contextWith(undefined))).toBe(true);
    expect(guardWith('false').canActivate(contextWith(undefined))).toBe(true);
  });
});
