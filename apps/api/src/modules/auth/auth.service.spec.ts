// Owner: Person A (Identity/Auth/Security)

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let userService: jest.Mocked<Partial<UserService>>;
  let auditService: jest.Mocked<Partial<AuditService>>;

  beforeEach(async () => {
    userService = {
      findByEmailWithPassword: jest.fn(),
      getRefreshTokenHash: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };
    auditService = {
      logEvent: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: AuditService, useValue: auditService },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('token'), verifyAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  it('rejects login when the user does not exist', async () => {
    (userService.findByEmailWithPassword as jest.Mock).mockResolvedValue(null);

    await expect(
      authService.validateCredentials('missing@example.com', 'password123', null),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditService.logEvent).toHaveBeenCalled();
  });

  it('rejects login when the password does not match', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    (userService.findByEmailWithPassword as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      passwordHash,
      isActive: true,
    });

    await expect(
      authService.validateCredentials('a@example.com', 'wrong-password', null),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts login when credentials match', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    (userService.findByEmailWithPassword as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      passwordHash,
      isActive: true,
    });

    const user = await authService.validateCredentials('a@example.com', 'correct-password', null);
    expect(user.id).toBe('user-1');
  });
});
