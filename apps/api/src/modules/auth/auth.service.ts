// Owner: Person A (Identity/Auth/Security)

import { ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  JwtPayload,
  LoginResponse,
  RefreshResponse,
} from '@secure-exam/types';
import { AuditEventType, Role } from '@secure-exam/types';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
const refreshDigest = (token: string) => createHash('sha256').update(token).digest('hex');
import { AuditService } from '../audit/audit.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExamRefreshSessionEntity } from './exam-refresh-session.entity';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { assertAttemptSession } from '../attempt/attempt-session';
import { UserService } from '../user/user.service';

const REFRESH_HASH_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    @Optional() @InjectDataSource() private readonly db?: DataSource,
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

  /**
   * Administrators work in a normal browser; the exam app is a locked-down
   * student kiosk. Rejected before any token is issued, so the kiosk can never
   * end up holding an admin session. ALLOW_ADMIN_ON_DESKTOP lifts it for development.
   */
  private async rejectAdminOnDesktop(
    role: string,
    clientType: string | undefined,
    userId: string,
    ipAddress: string | null,
  ): Promise<void> {
    if (clientType?.toUpperCase() !== 'DESKTOP' || role !== Role.ADMIN) return;
    if (this.configService.get<boolean | string>('ALLOW_ADMIN_ON_DESKTOP') === true) return;
    await this.auditService.logEvent(
      AuditEventType.LOGIN_FAILED,
      { reason: 'admin_on_desktop' },
      userId,
      ipAddress,
    );
    throw new ForbiddenException(
      'Administrators cannot sign in from the exam app. Open the admin portal in a web browser.',
    );
  }

  /**
   * A session for someone who has already proved who they are by other means
   * (a one-time exam launch token redeemed in the exam app). Same tokens and
   * audit line as a password login. Bound exam sessions keep their refresh
   * tokens separate from the student's browser session.
   */
  async startSessionForUser(
    user: { id: string; email: string; fullName: string; role: Role },
    ipAddress: string | null,
    metadata: Record<string, unknown> = {},
    binding?: { examSessionId: string; examId: string },
  ): Promise<LoginResponse> {
    const tokens = await this.issueTokenPair(user.id, user.email, user.role, binding);
    await this.auditService.logEvent(AuditEventType.LOGIN, { email: user.email, ...metadata }, user.id, ipAddress);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }

  async login(
    email: string,
    password: string,
    ipAddress: string | null,
    clientType?: string,
  ): Promise<LoginResponse> {
    const user = await this.validateCredentials(email, password, ipAddress);
    await this.rejectAdminOnDesktop(user.role, clientType, user.id, ipAddress);
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

  async refresh(
    refreshToken: string,
    ipAddress: string | null,
    clientType?: string,
  ): Promise<RefreshResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const examSession = payload.examSessionId ? await this.db!.getRepository(ExamRefreshSessionEntity).findOne({ where: { id: payload.examSessionId, userId: payload.sub } }) : null;
    if (payload.examSessionId) {
      if (!examSession || examSession.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Exam session expired');
      const attempt = await this.db!.getRepository(AttemptEntity).findOne({ where: { examId: payload.examId, studentId: payload.sub } });
      if (attempt) assertAttemptSession(attempt, payload);
    }
    const storedHash = payload.examSessionId ? examSession?.tokenHash : await this.userService.getRefreshTokenHash(payload.sub);
    if (!storedHash) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const matches = await bcrypt.compare(payload.examSessionId ? refreshDigest(refreshToken) : refreshToken, storedHash);
    if (!matches) {
      // Possible token reuse/theft — revoke immediately.
      if (!payload.examSessionId) await this.userService.setRefreshTokenHash(payload.sub, null);
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    await this.rejectAdminOnDesktop(payload.role, clientType, payload.sub, ipAddress);
    const tokens = await this.issueTokenPair(payload.sub, payload.email, payload.role, payload.examSessionId && payload.examId ? { examSessionId: payload.examSessionId, examId: payload.examId } : undefined);

    await this.auditService.logEvent(
      AuditEventType.TOKEN_REFRESHED,
      {},
      payload.sub,
      ipAddress,
    );

    return tokens;
  }

  async me(userId: string): Promise<LoginResponse['user']> {
    const user = await this.userService.findById(userId);
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  }

  async logout(userId: string, ipAddress: string | null, examSessionId?: string): Promise<void> {
    if (examSessionId) await this.db!.getRepository(ExamRefreshSessionEntity).delete({ id: examSessionId, userId });
    else await this.userService.setRefreshTokenHash(userId, null);
    await this.auditService.logEvent(AuditEventType.LOGOUT, {}, userId, ipAddress);
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    role: JwtPayload['role'],
    binding?: { examSessionId: string; examId: string },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub: userId, email, role, ...binding };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
    });

    // Only the hash is persisted — a leaked DB row can't be replayed as a token.
    const refreshTokenHash = await bcrypt.hash(binding ? refreshDigest(refreshToken) : refreshToken, REFRESH_HASH_ROUNDS);
    if (binding) {
      const decoded = this.jwtService.decode(refreshToken) as JwtPayload;
      await this.db!.getRepository(ExamRefreshSessionEntity).save({ id: binding.examSessionId, userId,
        examId: binding.examId, tokenHash: refreshTokenHash, expiresAt: new Date((decoded.exp ?? 0) * 1000) });
    } else await this.userService.setRefreshTokenHash(userId, refreshTokenHash);

    return { accessToken, refreshToken };
  }
}
