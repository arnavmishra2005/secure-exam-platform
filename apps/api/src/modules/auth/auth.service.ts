// Owner: Person A (Identity/Auth/Security)

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  JwtPayload,
  LoginResponse,
  RefreshResponse,
} from '@secure-exam/types';
import { AuditEventType } from '@secure-exam/types';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { UserService } from '../user/user.service';

const REFRESH_HASH_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async validateCredentials(email: string, password: string, ipAddress: string | null) {
    const user = await this.userService.findByEmailWithPassword(email);

    if (!user || !user.isActive) {
      await this.auditService.logEvent(
        AuditEventType.LOGIN_FAILED,
        { email, reason: 'not_found_or_inactive' },
        null,
        ipAddress,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      await this.auditService.logEvent(
        AuditEventType.LOGIN_FAILED,
        { email, reason: 'bad_password' },
        user.id,
        ipAddress,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(email: string, password: string, ipAddress: string | null): Promise<LoginResponse> {
    const user = await this.validateCredentials(email, password, ipAddress);
    const tokens = await this.issueTokenPair(user.id, user.email, user.role);

    await this.auditService.logEvent(
      AuditEventType.LOGIN,
      { email },
      user.id,
      ipAddress,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async refresh(refreshToken: string, ipAddress: string | null): Promise<RefreshResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const storedHash = await this.userService.getRefreshTokenHash(payload.sub);
    if (!storedHash) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const matches = await bcrypt.compare(refreshToken, storedHash);
    if (!matches) {
      // Possible token reuse/theft — revoke immediately.
      await this.userService.setRefreshTokenHash(payload.sub, null);
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const tokens = await this.issueTokenPair(payload.sub, payload.email, payload.role);

    await this.auditService.logEvent(
      AuditEventType.TOKEN_REFRESHED,
      {},
      payload.sub,
      ipAddress,
    );

    return tokens;
  }

  async logout(userId: string, ipAddress: string | null): Promise<void> {
    await this.userService.setRefreshTokenHash(userId, null);
    await this.auditService.logEvent(AuditEventType.LOGOUT, {}, userId, ipAddress);
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    role: JwtPayload['role'],
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub: userId, email, role };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
    });

    // Only the hash is persisted — a leaked DB row can't be replayed as a token.
    const refreshTokenHash = await bcrypt.hash(refreshToken, REFRESH_HASH_ROUNDS);
    await this.userService.setRefreshTokenHash(userId, refreshTokenHash);

    return { accessToken, refreshToken };
  }
}
