import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { SubmissionService } from './submission.service';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { AnswerEntity } from './entities/answer.entity';
import { SubmissionEntity } from './entities/submission.entity';
import { ResultEntity } from './entities/result.entity';
import { AttemptService } from '../attempt/attempt.service';
import { TimerService } from '../attempt/timer.service';
import { IQuestionLookupService, QUESTION_LOOKUP_SERVICE } from './question-lookup/question-lookup.interface';
import { AttemptStatus, Role } from '@secure-exam/types';
// Person A's contract — see submission.service.ts for the "assumed to exist" note.
import { AuditService } from '../audit/audit.service';

function makeRepoMock() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) =>
      Promise.resolve({ id: 'row-1', createdAt: new Date(), updatedAt: new Date(), ...x }),
    ),
    createQueryBuilder: jest.fn(),
  };
}

describe('SubmissionService', () => {
  let service: SubmissionService;
  // The plain repositories injected via @InjectRepository — used only by
  // the read-only admin endpoints (listSubmissions/getResultForAttempt/etc.).
  let submissionRepo: ReturnType<typeof makeRepoMock>;
  let resultRepo: ReturnType<typeof makeRepoMock>;
  // The repositories/entity returned by `manager.getRepository(...)` inside
  // the locked transaction — the ACTUAL write path finalizeLocked() uses.
  let managerAttemptRepo: { findOne: jest.Mock };
  let managerAnswerRepo: { find: jest.Mock };
  let managerSubmissionRepo: ReturnType<typeof makeRepoMock>;
  let managerResultRepo: ReturnType<typeof makeRepoMock>;
  let manager: { getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let attemptService: {
    findOwnedAttemptOrThrow: jest.Mock;
    markSubmitted: jest.Mock;
    markAutoSubmitted: jest.Mock;
    findExpiredInProgressAttemptIds: jest.Mock;
  };
  let timerService: { isAttemptValid: jest.Mock };
  let questionLookup: jest.Mocked<IQuestionLookupService>;
  let auditService: { logEvent: jest.Mock };

  const student = { sub: 'student-1', role: Role.STUDENT } as any;
  const inProgressAttempt = {
    id: 'attempt-1',
    examId: 'exam-1',
    studentId: 'student-1',
    status: AttemptStatus.IN_PROGRESS,
    expiresAt: new Date(Date.now() + 60_000),
  } as any;

  beforeEach(async () => {
    submissionRepo = makeRepoMock();
    resultRepo = makeRepoMock();

    managerAttemptRepo = { findOne: jest.fn().mockResolvedValue(inProgressAttempt) };
    managerAnswerRepo = { find: jest.fn().mockResolvedValue([]) };
    managerSubmissionRepo = makeRepoMock();
    managerResultRepo = makeRepoMock();

    manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === AttemptEntity) return managerAttemptRepo;
        if (entity === AnswerEntity) return managerAnswerRepo;
        if (entity === SubmissionEntity) return managerSubmissionRepo;
        if (entity === ResultEntity) return managerResultRepo;
        throw new Error(`Unexpected getRepository call for ${String(entity)}`);
      }),
    };
    // Mirrors real TypeORM DataSource.transaction() closely enough for
    // unit testing: runs the callback and returns/throws whatever the
    // callback returns/throws. It does NOT (and cannot, being a plain
    // mock) simulate real Postgres row-locking or SQL ROLLBACK; that's
    // what the Postgres-backed integration test in
    // test/integration/submission-finalize.spec.ts is for.
    dataSource = { transaction: jest.fn((cb: (m: any) => Promise<any>) => cb(manager)) };

    attemptService = {
      findOwnedAttemptOrThrow: jest.fn().mockResolvedValue(inProgressAttempt),
      markSubmitted: jest.fn().mockResolvedValue(undefined),
      markAutoSubmitted: jest.fn().mockResolvedValue(undefined),
      findExpiredInProgressAttemptIds: jest.fn().mockResolvedValue([]),
    };
    timerService = { isAttemptValid: jest.fn().mockReturnValue(true) };
    questionLookup = {
      getQuestionsForExam: jest.fn().mockResolvedValue([
        { id: 'q-1', marks: 1, answerFormat: 'SINGLE_CHOICE', optionIds: ['opt-a'], correctOptionIds: ['opt-a'] },
        { id: 'q-2', marks: 2, answerFormat: 'TEXT' },
      ]),
      getPublicQuestionsForExam: jest.fn().mockResolvedValue([]),
    };
    auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionService,
        { provide: getRepositoryToken(SubmissionEntity), useValue: submissionRepo },
        { provide: getRepositoryToken(ResultEntity), useValue: resultRepo },
        { provide: AttemptService, useValue: attemptService },
        { provide: TimerService, useValue: timerService },
        { provide: QUESTION_LOOKUP_SERVICE, useValue: questionLookup },
        { provide: AuditService, useValue: auditService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(SubmissionService);
  });

  describe('submit', () => {
    it('finalizes a submission within the time window as a manual SUBMITTED', async () => {
      managerAnswerRepo.find.mockResolvedValue([{ questionId: 'q-1', selectedOptionIds: ['opt-a'], textResponse: null }]);

      const { submission, result } = await service.submit('attempt-1', student, {});

      expect(submission.isAutoSubmitted).toBe(false);
      expect(attemptService.markSubmitted).toHaveBeenCalledWith('attempt-1', manager);
      expect(result.score).toBe(1); // q-1 correct; q-2 subjective/unanswered
      expect(result.maxScore).toBe(3);
      expect(result.needsManualReview).toBe(true); // q-2 is TEXT
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'SUBMITTED',
        expect.objectContaining({ attemptId: 'attempt-1' }),
        student.sub,
      );
    });

    it('rejects submitting an already-finalized attempt (fast, unlocked pre-check)', async () => {
      attemptService.findOwnedAttemptOrThrow.mockResolvedValue({
        ...inProgressAttempt,
        status: AttemptStatus.SUBMITTED,
      });

      await expect(service.submit('attempt-1', student, {})).rejects.toThrow(ConflictException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('finalizes as AUTO_SUBMITTED when the deadline has already passed', async () => {
      timerService.isAttemptValid.mockReturnValue(false);

      const { submission } = await service.submit('attempt-1', student, {});

      expect(submission.isAutoSubmitted).toBe(true);
      expect(attemptService.markAutoSubmitted).toHaveBeenCalledWith('attempt-1', manager);
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'AUTO_SUBMITTED',
        expect.objectContaining({ attemptId: 'attempt-1' }),
        student.sub,
      );
    });
  });

  describe('assertAttemptIsWritable', () => {
    it('returns the attempt when it is IN_PROGRESS and within the time window', async () => {
      const result = await service.assertAttemptIsWritable('attempt-1', student);
      expect(result).toBe(inProgressAttempt);
    });

    it('rejects writes to an already-finalized attempt', async () => {
      attemptService.findOwnedAttemptOrThrow.mockResolvedValue({
        ...inProgressAttempt,
        status: AttemptStatus.SUBMITTED,
      });

      await expect(service.assertAttemptIsWritable('attempt-1', student)).rejects.toThrow(ConflictException);
    });

    it('auto-submits (fully committed) and rejects the write when the attempt has expired', async () => {
      timerService.isAttemptValid.mockReturnValue(false);

      await expect(service.assertAttemptIsWritable('attempt-1', student)).rejects.toThrow(ForbiddenException);
      expect(attemptService.markAutoSubmitted).toHaveBeenCalledWith('attempt-1', manager);
      // The auto-submit's own audit event fires — it already committed
      // successfully before the ForbiddenException is thrown to the caller.
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'AUTO_SUBMITTED',
        expect.objectContaining({ attemptId: 'attempt-1' }),
        inProgressAttempt.studentId,
      );
    });
  });

  describe('withLockedInProgressAttempt (concurrency fix: clean 409 instead of a raw constraint 500)', () => {
    it('runs `work` when the locked re-check still finds the attempt IN_PROGRESS', async () => {
      const work = jest.fn().mockResolvedValue('ok');

      const result = await service.withLockedInProgressAttempt('attempt-1', work);

      expect(result).toBe('ok');
      expect(managerAttemptRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(work).toHaveBeenCalledWith(manager, inProgressAttempt);
    });

    it('throws ConflictException — not the underlying DB error — when the locked re-check finds the attempt already finalized', async () => {
      managerAttemptRepo.findOne.mockResolvedValue({ ...inProgressAttempt, status: AttemptStatus.SUBMITTED });
      const work = jest.fn();

      await expect(service.withLockedInProgressAttempt('attempt-1', work)).rejects.toThrow(ConflictException);
      // The point of the lock+recheck: work (the actual write) never runs
      // once the attempt is known to already be finalized.
      expect(work).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if the attempt no longer exists under the lock', async () => {
      managerAttemptRepo.findOne.mockResolvedValue(null);

      await expect(service.withLockedInProgressAttempt('attempt-1', jest.fn())).rejects.toThrow(
        'Attempt not found',
      );
    });

    it('submit() surfaces this as the caller-facing error for a losing concurrent request', async () => {
      // Simulates losing the lock-acquisition race: by the time this
      // request's transaction acquires the lock, another one already
      // committed SUBMITTED.
      managerAttemptRepo.findOne.mockResolvedValue({ ...inProgressAttempt, status: AttemptStatus.SUBMITTED });

      await expect(service.submit('attempt-1', student, {})).rejects.toThrow(ConflictException);
      expect(managerSubmissionRepo.save).not.toHaveBeenCalled();
      expect(managerResultRepo.save).not.toHaveBeenCalled();
      expect(auditService.logEvent).not.toHaveBeenCalled();
    });
  });

  describe('finalize transactional integrity', () => {
    it('performs the attempt-status flip, the Submission insert, and the Result insert inside one DataSource.transaction() call, using the manager — never the plain injected repositories', async () => {
      managerAnswerRepo.find.mockResolvedValue([{ questionId: 'q-1', selectedOptionIds: ['opt-a'], textResponse: null }]);

      await service.submit('attempt-1', student, {});

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(attemptService.markSubmitted).toHaveBeenCalledWith('attempt-1', manager);
      expect(manager.getRepository).toHaveBeenCalledWith(SubmissionEntity);
      expect(manager.getRepository).toHaveBeenCalledWith(ResultEntity);
      expect(managerSubmissionRepo.save).toHaveBeenCalled();
      expect(managerResultRepo.save).toHaveBeenCalled();
      expect(submissionRepo.save).not.toHaveBeenCalled();
      expect(resultRepo.save).not.toHaveBeenCalled();
    });

    it(
      'propagates the failure and logs no audit event when the Result insert fails inside the transaction ' +
        '(a real TypeORM DataSource rolls the whole transaction back here — see the Postgres-backed ' +
        'integration test for a live proof that the attempt status and Submission row are rolled back too)',
      async () => {
        managerAnswerRepo.find.mockResolvedValue([{ questionId: 'q-1', selectedOptionIds: ['opt-a'], textResponse: null }]);
        const dbError = new Error('duplicate key value violates unique constraint "UQ_results_attemptId"');
        managerResultRepo.save.mockRejectedValueOnce(dbError);

        await expect(service.submit('attempt-1', student, {})).rejects.toThrow(dbError);

        expect(attemptService.markSubmitted).toHaveBeenCalledWith('attempt-1', manager);
        expect(managerSubmissionRepo.save).toHaveBeenCalled();
        expect(auditService.logEvent).not.toHaveBeenCalled();
      },
    );

    it('does not fail the request when the transaction succeeds but audit logging itself throws', async () => {
      managerAnswerRepo.find.mockResolvedValue([{ questionId: 'q-1', selectedOptionIds: ['opt-a'], textResponse: null }]);
      auditService.logEvent.mockRejectedValueOnce(new Error('audit service unreachable'));

      const { submission, result } = await service.submit('attempt-1', student, {});

      expect(submission.isAutoSubmitted).toBe(false);
      expect(result.score).toBe(1);
    });
  });

  describe('sweepExpiredAttempts', () => {
    it('finalizes every expired attempt id it finds and reports how many succeeded', async () => {
      attemptService.findExpiredInProgressAttemptIds.mockResolvedValue(['a1', 'a2']);

      const { sweptCount, failedCount } = await service.sweepExpiredAttempts();

      expect(sweptCount).toBe(2);
      expect(failedCount).toBe(0);
      expect(attemptService.markAutoSubmitted).toHaveBeenCalledTimes(2);
    });

    it('treats a ConflictException (already finalized by someone else) as expected, not a failure', async () => {
      attemptService.findExpiredInProgressAttemptIds.mockResolvedValue(['a1']);
      managerAttemptRepo.findOne.mockResolvedValueOnce({ ...inProgressAttempt, status: AttemptStatus.SUBMITTED });

      const { sweptCount, failedCount } = await service.sweepExpiredAttempts();

      expect(sweptCount).toBe(0);
      expect(failedCount).toBe(0);
    });

    it('counts a genuine error separately and keeps sweeping the rest of the list', async () => {
      attemptService.findExpiredInProgressAttemptIds.mockResolvedValue(['a1', 'a2']);
      managerAttemptRepo.findOne
        .mockRejectedValueOnce(new Error('connection lost'))
        .mockResolvedValueOnce(inProgressAttempt);

      const { sweptCount, failedCount } = await service.sweepExpiredAttempts();

      expect(failedCount).toBe(1);
      expect(sweptCount).toBe(1);
    });
  });

  describe('overrideScore', () => {
    it('rejects a score above the result maxScore', async () => {
      resultRepo.findOne.mockResolvedValue({
        id: 'result-1',
        attemptId: 'attempt-1',
        examId: 'exam-1',
        studentId: 'student-1',
        score: 1,
        maxScore: 3,
        autoGraded: false,
        needsManualReview: true,
        published: false,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.overrideScore('attempt-1', 5, 'admin-1')).rejects.toThrow(BadRequestException);
      expect(resultRepo.save).not.toHaveBeenCalled();
    });

    it('accepts a score at or below maxScore', async () => {
      resultRepo.findOne.mockResolvedValue({
        id: 'result-1',
        attemptId: 'attempt-1',
        examId: 'exam-1',
        studentId: 'student-1',
        score: 1,
        maxScore: 3,
        autoGraded: false,
        needsManualReview: true,
        published: false,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.overrideScore('attempt-1', 3, 'admin-1');

      expect(result.score).toBe(3);
      expect(result.needsManualReview).toBe(false);
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'RESULT_SCORE_OVERRIDDEN',
        expect.objectContaining({ attemptId: 'attempt-1', newScore: 3 }),
        'admin-1',
      );
    });
  });
});
