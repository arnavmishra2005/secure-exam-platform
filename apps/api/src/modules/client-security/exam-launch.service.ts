// Owner: Person C (Electron, Kiosk & Security)
//
// Opening an exam in the exam app without ever sending the password there.
//
//   browser (signed in) --POST /auth/exam-launch--> one-time token
//   browser opens secure-exam://launch/<token>
//   exam app --POST /auth/exam-launch/preview--> email to show (token not used up)
//   student clicks Login
//   exam app --POST /auth/exam-launch/redeem--> a normal session (token used up)
//
// The token is 32 random bytes, valid for EXAM_LAUNCH_TTL_SECONDS (default 2 minutes),
// works once, and only its SHA-256 hash is stored.

import { ForbiddenException, GoneException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from '@secure-exam/types';
import type { ExamLaunchCreated, ExamLaunchPreview, JwtPayload, LoginResponse } from '@secure-exam/types';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { ExamLaunchTokenEntity } from './entities/exam-launch-token.entity';

const DEFAULT_TTL_SECONDS = 120;
const EXPIRED = 'This launch link has expired or was already used. Go back to your browser and start the exam again.';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class ExamLaunchService {
  constructor(
    @InjectRepository(ExamLaunchTokenEntity) private readonly tokens: Repository<ExamLaunchTokenEntity>,
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private ttlSeconds(): number {
    return Number(this.config.get('EXAM_LAUNCH_TTL_SECONDS')) || DEFAULT_TTL_SECONDS;
  }

  async create(user: JwtPayload, examId: string): Promise<ExamLaunchCreated> {
    const token = randomBytes(32).toString('base64url');
    const expiresInSeconds = this.ttlSeconds();
    await this.tokens.insert({
      tokenHash: sha256(token),
      userId: user.sub,
      examId,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    });
    return { token, expiresInSeconds };
  }

  /** Who the token belongs to, without using it up. */
  async preview(token: string): Promise<ExamLaunchPreview> {
    const row = await this.tokens
      .createQueryBuilder('t')
      .where('t.tokenHash = :hash AND t.usedAt IS NULL AND t.expiresAt > now()', { hash: sha256(token) })
      .getOne();
    if (!row) throw new GoneException(EXPIRED);
    const user = await this.userService.findById(row.userId);
    return { email: user.email, fullName: user.fullName, examId: row.examId };
  }

  /** Uses the token up and starts a session. */
  async redeem(token: string, ipAddress: string | null): Promise<LoginResponse & { examId: string }> {
    // One statement decides: only one caller can ever flip usedAt, and an expired token never matches.
    const result = await this.tokens
      .createQueryBuilder()
      .update()
      .set({ usedAt: () => 'now()' })
      .where('"tokenHash" = :hash AND "usedAt" IS NULL AND "expiresAt" > now()', { hash: sha256(token) })
      .returning(['userId', 'examId'])
      .execute();
    const row = (result.raw as Array<{ userId: string; examId: string }>)[0];
    if (!row) throw new GoneException(EXPIRED);

    const user = await this.userService.findById(row.userId);
    if (!user.isActive || user.role !== Role.STUDENT) {
      throw new ForbiddenException('Only students can take an exam in the exam app.');
    }
    const session = await this.authService.startSessionForUser(user, ipAddress, {
      via: 'exam-launch',
      examId: row.examId,
    });
    return { ...session, examId: row.examId };
  }
}
