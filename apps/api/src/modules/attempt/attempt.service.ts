import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, IsNull, LessThan, Repository } from 'typeorm';
import { AttemptEntity } from './entities/attempt.entity';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { TimerService } from './timer.service';
import { EXAM_LOOKUP_SERVICE, IExamLookupService } from './exam-lookup/exam-lookup.interface';
import { AttemptStatus, ExtensionScope, Role } from '@secure-exam/types';
import type { Attempt, AttemptMonitorView, HeartbeatResponse, JwtPayload } from '@secure-exam/types';
import { ListAttemptsQueryDto, StartAttemptDto } from '@secure-exam/validation';
// Person A's contract (assumed to exist per Day-0 foundation — see
// task-breakdown doc, section 2 & 3): AuditService.logEvent(type, metadata, actorId).
import { AuditService } from '../audit/audit.service';
import { logAuditSafely } from './audit-safe.util';
import { isUniqueViolation } from './postgres-error.util';
import { ExamExtensionEntity } from '../extension/entities/exam-extension.entity';
import { UserService } from '../user/user.service';

/** Default seconds without a heartbeat before monitoring shows an attempt as disconnected. */
const DEFAULT_DISCONNECT_SECONDS = 45;

@Injectable()
export class AttemptService {
  private readonly logger = new Logger(AttemptService.name);

  constructor(
    @InjectRepository(AttemptEntity) private readonly attemptRepository: Repository<AttemptEntity>,
    @InjectRepository(ExamSessionEntity)
    private readonly examSessionRepository: Repository<ExamSessionEntity>,
    private readonly timerService: TimerService,
    @Inject(EXAM_LOOKUP_SERVICE) private readonly examLookup: IExamLookupService,
    private readonly auditService: AuditService,
    @InjectRepository(ExamExtensionEntity)
    private readonly extensionRepository: Repository<ExamExtensionEntity>,
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Eligibility checks (registered? exam active? not already attempted?),
   * then creates the attempt with a server-authoritative `expiresAt`.
   *
   * Double-guards the "not already attempted" rule: an upfront `findOne`
   * check gives a cheap, fast rejection for the common case, and the
   * `UQ_attempts_exam_student` DB constraint (caught below) is the real
   * guarantee for the rare case where two requests for the same exam+
   * student race past that initial check at the same time — the loser
   * gets a clean 409, not a raw constraint-violation 500.
   */
  async startAttempt(user: JwtPayload, dto: StartAttemptDto): Promise<Attempt> {
    const studentId = user.sub;
    const exam = await this.examLookup.getExamById(dto.examId);

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    const now = new Date();
    const examStart = new Date(exam.startTime);
    const examEnd = new Date(exam.endTime);

    if (exam.status !== 'ACTIVE' || now < examStart || now > examEnd) {
      await logAuditSafely(
        this.logger,
        this.auditService,
        'SECURITY_CHECK_FAILED',
        { reason: 'EXAM_NOT_ACTIVE', examId: dto.examId, examStatus: exam.status },
        studentId,
      );
      throw new ForbiddenException('This exam is not currently active');
    }

    // Phase 4: unpublished exams are invisible to students, so they can't be started either.
    if (!exam.publishedAt) {
      await logAuditSafely(
        this.logger,
        this.auditService,
        'SECURITY_CHECK_FAILED',
        { reason: 'EXAM_NOT_PUBLISHED', examId: dto.examId },
        studentId,
      );
      throw new ForbiddenException('This exam has not been published');
    }

    const isAssigned = await this.examLookup.isStudentAssignedToExam(dto.examId, studentId);
    if (!isAssigned) {
      await logAuditSafely(
        this.logger,
        this.auditService,
        'SECURITY_CHECK_FAILED',
        { reason: 'STUDENT_NOT_ASSIGNED', examId: dto.examId },
        studentId,
      );
      throw new ForbiddenException('You are not assigned to this exam');
    }

    const existing = await this.attemptRepository.findOne({
      where: { examId: dto.examId, studentId },
    });
    if (existing) {
      throw new ConflictException('You have already attempted this exam');
    }

    // Per-student extra time granted before the student started (Phase 4).
    const extraMinutes = await this.pendingStudentExtensionMinutes(dto.examId, studentId);
    const expiresAt = this.timerService.computeExpiresAt(now, exam.durationMinutes, examEnd, extraMinutes);

    const attempt = this.attemptRepository.create({
      examId: dto.examId,
      studentId,
      status: AttemptStatus.IN_PROGRESS,
      startedAt: now,
      expiresAt,
      submittedAt: null,
    });

    let saved: AttemptEntity;
    try {
      saved = await this.attemptRepository.save(attempt);
    } catch (err) {
      if (isUniqueViolation(err, 'UQ_attempts_exam_student')) {
        // Lost the race: another request for the same exam+student
        // committed first between our findOne() above and this insert.
        throw new ConflictException('You have already attempted this exam');
      }
      throw err;
    }

    await this.examSessionRepository.save(
      this.examSessionRepository.create({
        attemptId: saved.id,
        startedAt: now,
        lastSeenAt: now,
        ipAddress: null,
        userAgent: null,
        endedAt: null,
      }),
    );

    await logAuditSafely(
      this.logger,
      this.auditService,
      'EXAM_STARTED',
      { attemptId: saved.id, examId: dto.examId, extraMinutes },
      studentId,
    );

    return toAttemptDto(saved);
  }

  /** Sum of STUDENT-scope extensions for this student. All of them predate the attempt, which is unique per exam+student. */
  private async pendingStudentExtensionMinutes(examId: string, studentId: string): Promise<number> {
    const rows = await this.extensionRepository.find({
      where: { examId, studentId, scope: ExtensionScope.STUDENT },
      select: ['minutes'],
    });
    return rows.reduce((sum, row) => sum + row.minutes, 0);
  }

  /**
   * Enforces attempt ownership: a student may only access their own
   * attempt; an admin may access any. Shared by AnswerService and
   * SubmissionService so ownership logic lives in exactly one place.
   *
   * This is an UNLOCKED read — fine for ownership/existence, which never
   * changes for a given attempt. It is deliberately NOT the source of
   * truth for "is this attempt currently writable" under concurrency; see
   * SubmissionService#withLockedInProgressAttempt for the locked version
   * used immediately before any actual write.
   */
  async findOwnedAttemptOrThrow(attemptId: string, user: JwtPayload): Promise<AttemptEntity> {
    const attempt = await this.attemptRepository.findOne({ where: { id: attemptId } });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }
    if (user.role === Role.STUDENT && attempt.studentId !== user.sub) {
      await logAuditSafely(
        this.logger,
        this.auditService,
        'SECURITY_CHECK_FAILED',
        { reason: 'ATTEMPT_OWNERSHIP_VIOLATION', attemptId, examId: attempt.examId },
        user.sub,
      );
      throw new ForbiddenException('You do not have access to this attempt');
    }
    return attempt;
  }

  /**
   * The student's own attempt at an exam, so the exam client can resume it
   * after losing the attempt ID (a new tab, or cleared session storage).
   * Looks up by the JWT `sub`, so a student can only ever find their own.
   */
  async findMyAttemptForExam(examId: string, user: JwtPayload): Promise<Attempt> {
    const attempt = await this.attemptRepository.findOne({ where: { examId, studentId: user.sub } });
    if (!attempt) {
      throw new NotFoundException('You have not started this exam');
    }
    return toAttemptDto(attempt);
  }

  async getAttemptById(attemptId: string, user: JwtPayload): Promise<Attempt> {
    const attempt = await this.findOwnedAttemptOrThrow(attemptId, user);
    return toAttemptDto(attempt);
  }

  /** Admin-only: powers the /monitoring screen (GET /attempts). */
  async listForMonitoring(query: ListAttemptsQueryDto): Promise<{
    items: AttemptMonitorView[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: FindOptionsWhere<AttemptEntity> = {};
    if (query.examId) where.examId = query.examId;
    if (query.status) where.status = query.status;

    const [attempts, total] = await this.attemptRepository.findAndCount({
      where,
      order: { startedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const attemptIds = attempts.map((a) => a.id);
    const sessions = attemptIds.length
      ? await this.examSessionRepository
          .createQueryBuilder('s')
          .where('s.attemptId IN (:...ids)', { ids: attemptIds })
          .orderBy('s.lastSeenAt', 'DESC')
          .getMany()
      : [];

    const lastSeenByAttempt = new Map<string, Date>();
    for (const session of sessions) {
      if (!lastSeenByAttempt.has(session.attemptId)) {
        lastSeenByAttempt.set(session.attemptId, session.lastSeenAt);
      }
    }

    const [students, examTitles, extensions] = await Promise.all([
      this.userService.findStudentsByUserIds([...new Set(attempts.map((a) => a.studentId))]),
      this.examLookup.getExamTitles([...new Set(attempts.map((a) => a.examId))]),
      attempts.length
        ? this.extensionRepository.find({ where: { examId: In([...new Set(attempts.map((a) => a.examId))]) } })
        : Promise.resolve([] as ExamExtensionEntity[]),
    ]);
    const studentByUser = new Map(students.map((st) => [st.userId, st]));
    const disconnectMs =
      (Number(this.config.get('HEARTBEAT_DISCONNECT_SECONDS')) || DEFAULT_DISCONNECT_SECONDS) * 1000;

    const now = new Date();
    const items: AttemptMonitorView[] = attempts.map((a) => {
      const remainingSeconds = this.timerService.remainingSeconds(now, a.expiresAt);
      const lastSeen = lastSeenByAttempt.get(a.id) ?? null;
      const student = studentByUser.get(a.studentId);
      return {
        ...toAttemptDto(a),
        remainingSeconds,
        lastSeenAt: lastSeen?.toISOString() ?? null,
        studentName: student?.user?.fullName ?? null,
        collegeId: student?.collegeId ?? null,
        examTitle: examTitles.get(a.examId) ?? null,
        isDisconnected:
          a.status === AttemptStatus.IN_PROGRESS &&
          (!lastSeen || now.getTime() - lastSeen.getTime() > disconnectMs),
        extendedMinutes: extendedMinutesFor(a, extensions),
        // Person C's client-security module fills these in.
        violationCount: null,
        isFlagged: false,
        // True when the server-authoritative timer has already reached
        // zero but the row hasn't been finalized yet (either the periodic
        // expiry sweep hasn't reached it, or nobody has touched the
        // attempt since it expired to trigger the lazy auto-submit path).
        // Lets the admin UI show "closing out" rather than implying the
        // attempt is still live.
        isOverdue: a.status === AttemptStatus.IN_PROGRESS && remainingSeconds <= 0,
      };
    });

    return { items, total, page, limit };
  }

  /**
   * Liveness signal for the monitoring screen, and the exam client's clock
   * source: the response carries the server's time and the attempt's
   * current expiry, so a time extension reaches a running client within
   * one heartbeat and client clock skew is corrected.
   */
  async heartbeat(
    attemptId: string,
    user: JwtPayload,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<HeartbeatResponse> {
    const attempt = await this.findOwnedAttemptOrThrow(attemptId, user);
    const now = new Date();
    const response: HeartbeatResponse = {
      serverTime: now.toISOString(),
      expiresAt: attempt.expiresAt.toISOString(),
      remainingSeconds:
        attempt.status === AttemptStatus.IN_PROGRESS ? this.timerService.remainingSeconds(now, attempt.expiresAt) : 0,
      status: attempt.status,
    };
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      return response; // nothing to track once finalized
    }

    const latest = await this.examSessionRepository.findOne({
      where: { attemptId, endedAt: IsNull() },
      order: { lastSeenAt: 'DESC' },
    });

    if (latest) {
      latest.lastSeenAt = now;
      if (meta.ipAddress) latest.ipAddress = meta.ipAddress;
      if (meta.userAgent) latest.userAgent = meta.userAgent;
      await this.examSessionRepository.save(latest);
    } else {
      await this.examSessionRepository.save(
        this.examSessionRepository.create({
          attemptId,
          startedAt: now,
          lastSeenAt: now,
          ipAddress: meta.ipAddress ?? null,
          userAgent: meta.userAgent ?? null,
          endedAt: null,
        }),
      );
    }
    return response;
  }

  /**
   * IDs only, kept cheap — used by SubmissionService's periodic expiry
   * sweep (defense in depth alongside the lazy auto-submit-on-touch
   * behaviour) to find IN_PROGRESS attempts whose server-authoritative
   * timer has already run out.
   */
  async findExpiredInProgressAttemptIds(now: Date = new Date()): Promise<string[]> {
    const rows = await this.attemptRepository.find({
      where: { status: AttemptStatus.IN_PROGRESS, expiresAt: LessThan(now) },
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }

  /** Called only by SubmissionService once a manual submission is finalized. */
  async markSubmitted(attemptId: string, manager?: EntityManager): Promise<void> {
    await this.finalizeStatus(attemptId, AttemptStatus.SUBMITTED, manager);
  }

  /** Called only by SubmissionService once an expiry-triggered submission is finalized. */
  async markAutoSubmitted(attemptId: string, manager?: EntityManager): Promise<void> {
    await this.finalizeStatus(attemptId, AttemptStatus.AUTO_SUBMITTED, manager);
  }

  /**
   * Accepts an optional transactional `EntityManager` so this write can
   * participate in the same DB transaction as SubmissionService's Submission
   * + Result inserts (see submission.service.ts) — without one, it behaves
   * exactly as before, writing through the injected repositories.
   *
   * Explicitly checks `affected === 1` rather than trusting the call
   * succeeded silently: SubmissionService's locked callers already
   * guarantee the row exists at this point (they fetch-and-lock it first),
   * but this method can in principle be called on its own, so it shouldn't
   * rely on that upstream guarantee to stay correct — a raced or
   * already-deleted attempt must fail loudly here, not silently no-op.
   */
  private async finalizeStatus(attemptId: string, status: AttemptStatus, manager?: EntityManager): Promise<void> {
    const now = new Date();
    const attemptRepo = manager ? manager.getRepository(AttemptEntity) : this.attemptRepository;
    const sessionRepo = manager ? manager.getRepository(ExamSessionEntity) : this.examSessionRepository;

    const updateResult = await attemptRepo.update({ id: attemptId }, { status, submittedAt: now });
    if (updateResult.affected !== 1) {
      throw new NotFoundException(
        `Attempt ${attemptId} could not be marked ${status} — expected to update exactly 1 row, ` +
          `updated ${updateResult.affected ?? 0}`,
      );
    }

    await sessionRepo.update({ attemptId, endedAt: IsNull() }, { endedAt: now });
  }
}

/**
 * Minutes of extra time an attempt has received: whole-exam extensions
 * granted while it was running, plus every extension for this student.
 */
function extendedMinutesFor(attempt: AttemptEntity, extensions: ExamExtensionEntity[]): number {
  return extensions
    .filter((e) => e.examId === attempt.examId)
    .filter((e) =>
      e.scope === ExtensionScope.STUDENT
        ? e.studentId === attempt.studentId
        : e.createdAt.getTime() > attempt.startedAt.getTime(),
    )
    .reduce((sum, e) => sum + e.minutes, 0);
}

export function toAttemptDto(entity: AttemptEntity): Attempt {
  return {
    id: entity.id,
    examId: entity.examId,
    studentId: entity.studentId,
    status: entity.status,
    startedAt: entity.startedAt.toISOString(),
    expiresAt: entity.expiresAt.toISOString(),
    submittedAt: entity.submittedAt ? entity.submittedAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
