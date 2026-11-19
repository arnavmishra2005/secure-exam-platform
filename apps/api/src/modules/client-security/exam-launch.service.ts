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

import { ConflictException, ForbiddenException, GoneException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AttemptStatus, Role } from '@secure-exam/types';
import type { ExamLaunchCreated, ExamLaunchPreview, JwtPayload, LoginResponse } from '@secure-exam/types';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { DEVICE_CHANGE_WINDOW_MS, effectiveExpiresAt, lastSeenOnOldDevice, leftThroughViolation } from '../attempt/timer-pause';
import { SecurityEventEntity } from './entities/security-event.entity';
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
  async redeem(token: string, ipAddress: string | null): Promise<LoginResponse & { examId: string; examSessionId: string }> {
    const binding = { examSessionId: randomUUID(), examId: '' };
    const outcome = await this.tokens.manager.transaction(async manager => {
      const repo = manager.getRepository(ExamLaunchTokenEntity);
      const row = await repo.createQueryBuilder('t').setLock('pessimistic_write')
        .where('t.tokenHash = :hash AND t.usedAt IS NULL AND t.expiresAt > now()', { hash: sha256(token) }).getOne();
      if (!row) throw new GoneException(EXPIRED);
      const user = await this.userService.findById(row.userId);
      if (!user.isActive || user.role !== Role.STUDENT) throw new ForbiddenException('Only students can take an exam in the exam app.');
      const attempts = manager.getRepository(AttemptEntity);
      const attempt = await attempts.createQueryBuilder('a').addSelect('a.deviceChangeTokenHash')
        .setLock('pessimistic_write').where('a.examId = :examId AND a.studentId = :studentId', { examId: row.examId, studentId: row.userId }).getOne();
      if (attempt?.status === AttemptStatus.IN_PROGRESS) {
        const now = new Date();
        if (attempt.deviceChangeTokenHash !== row.tokenHash || !attempt.deviceChangeApprovedAt) {
          // A new request to continue on this device. Unless the student left through a violation
          // (Ctrl+Alt+Delete), the timer stops where they left off: the old device's last heartbeat.
          let timerPausedAt = attempt.timerPausedAt;
          if (attempt.deviceChangeTokenHash !== row.tokenHash && !timerPausedAt) {
            const enteredAt = attempt.startedAt;
            if (!(await leftThroughViolation(manager, attempt.id, enteredAt))) {
              let start = (await lastSeenOnOldDevice(manager, attempt.id)) ?? now;
              // An earlier request that lapsed unapproved gave no time back: never pause before it ended.
              const earlier = attempt.deviceChangeRequestedAt;
              if (earlier && earlier.getTime() + DEVICE_CHANGE_WINDOW_MS <= now.getTime()) {
                const lapsedAt = new Date(earlier.getTime() + DEVICE_CHANGE_WINDOW_MS);
                if (start < lapsedAt) start = lapsedAt;
              }
              timerPausedAt = start < now ? start : now;
            }
          }
          if (effectiveExpiresAt({ expiresAt: attempt.expiresAt, timerPausedAt }, now) <= now) {
            throw new GoneException('The exam timer has expired.');
          }
          if (attempt.deviceChangeTokenHash !== row.tokenHash) {
            await attempts.update(attempt.id, { deviceChangeTokenHash: row.tokenHash,
              deviceChangeRequestedAt: now, deviceChangeApprovedAt: null, timerPausedAt });
            // Give the invigilator time to respond. Retrying cannot extend it again.
            await repo.update(row.id, { expiresAt: new Date(now.getTime() + DEVICE_CHANGE_WINDOW_MS) });
          }
          return { pending: true as const, timerPaused: !!timerPausedAt };
        }
        if (effectiveExpiresAt(attempt, now) <= now) throw new GoneException('The exam timer has expired.');
        // Approved: continue here, and the timer runs again from where it stopped.
        await attempts.update(attempt.id, { activeSessionId: binding.examSessionId,
          deviceChangeTokenHash: null, deviceChangeRequestedAt: null, deviceChangeApprovedAt: null,
          expiresAt: effectiveExpiresAt(attempt, now), timerPausedAt: null });
        await manager.getRepository(SecurityEventEntity).insert({ attemptId: attempt.id, examId: attempt.examId,
          studentId: attempt.studentId, type: 'DEVICE_CHANGED', detail: 'Invigilator-approved device change', occurredAt: new Date() });
      }
      await repo.update(row.id, { usedAt: new Date() });
      return { pending: false as const, user, examId: row.examId };
    });
    if (outcome.pending) throw new ConflictException({ code: 'DEVICE_CHANGE_PENDING', timerPaused: outcome.timerPaused,
      message: outcome.timerPaused
        ? 'Waiting for your invigilator to allow this device change in Monitoring. Your exam timer is paused until you continue here.'
        : 'Waiting for your invigilator to allow this device change in Monitoring. The exam timer keeps running.' });
    binding.examId = outcome.examId;
    const session = await this.authService.startSessionForUser(outcome.user, ipAddress,
      { via: 'exam-launch', examId: outcome.examId }, binding);
    return { ...session, examId: outcome.examId, examSessionId: binding.examSessionId };
  }
}
