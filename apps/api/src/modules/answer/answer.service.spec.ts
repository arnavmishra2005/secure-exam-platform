import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnswerService } from './answer.service';
import { AnswerEntity } from './entities/answer.entity';
import { AttemptService } from '../attempt/attempt.service';
import { SubmissionService } from './submission.service';
import {
  IQuestionLookupService,
  QUESTION_LOOKUP_SERVICE,
  QuestionLookupInfo,
} from './question-lookup/question-lookup.interface';
import { AttemptStatus, QuestionState, Role } from '@secure-exam/types';
// Person A's contract — see answer.service.ts for the "assumed to exist" note.
import { AuditService } from '../audit/audit.service';

function makeRepoMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) =>
      Promise.resolve({ id: 'answer-1', createdAt: new Date(), updatedAt: new Date(), ...x }),
    ),
  };
}

describe('AnswerService', () => {
  let service: AnswerService;
  // The plain repository injected via @InjectRepository — only ever used
  // for the read-only listForAttempt() path. The actual write path
  // (saveAnswer) must go through the LOCKED manager instead (managerAnswerRepo
  // below) — that distinction is exactly what several tests here check.
  let injectedAnswerRepo: ReturnType<typeof makeRepoMock>;
  let managerAnswerRepo: ReturnType<typeof makeRepoMock>;
  let manager: { getRepository: jest.Mock };
  let attemptService: { findOwnedAttemptOrThrow: jest.Mock };
  let submissionService: { assertAttemptIsWritable: jest.Mock; withLockedInProgressAttempt: jest.Mock };
  let questionLookup: jest.Mocked<IQuestionLookupService>;
  let auditService: { logEvent: jest.Mock };

  const student = { sub: 'student-1', role: Role.STUDENT } as any;
  const attempt = { id: 'attempt-1', examId: 'exam-1', studentId: 'student-1' };

  const singleChoiceQuestion: QuestionLookupInfo = {
    id: 'q-single',
    marks: 1,
    answerFormat: 'SINGLE_CHOICE',
    optionIds: ['opt-a', 'opt-b'],
    correctOptionIds: ['opt-a'],
  };
  const multipleChoiceQuestion: QuestionLookupInfo = {
    id: 'q-multi',
    marks: 2,
    answerFormat: 'MULTIPLE_CHOICE',
    optionIds: ['opt-a', 'opt-b', 'opt-c'],
    correctOptionIds: ['opt-a', 'opt-c'],
  };
  const textQuestion: QuestionLookupInfo = {
    id: 'q-text',
    marks: 2,
    answerFormat: 'TEXT',
  };

  beforeEach(async () => {
    injectedAnswerRepo = makeRepoMock();
    managerAnswerRepo = makeRepoMock();
    manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === AnswerEntity) return managerAnswerRepo;
        throw new Error(`Unexpected getRepository call for ${String(entity)}`);
      }),
    };

    attemptService = { findOwnedAttemptOrThrow: jest.fn().mockResolvedValue(attempt) };
    submissionService = {
      assertAttemptIsWritable: jest.fn().mockResolvedValue(attempt),
      // Mirrors the real method's contract closely enough for unit
      // testing: runs `work` against a locked manager/attempt. Doesn't
      // (and can't, being a mock) simulate real Postgres row-locking —
      // that's what the Postgres-backed integration test is for.
      withLockedInProgressAttempt: jest.fn((_attemptId: string, work: any) => work(manager, attempt)),
    };
    questionLookup = {
      getQuestionsForExam: jest
        .fn()
        .mockResolvedValue([singleChoiceQuestion, multipleChoiceQuestion, textQuestion]),
      getPublicQuestionsForExam: jest.fn().mockResolvedValue([]),
    };
    auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnswerService,
        { provide: getRepositoryToken(AnswerEntity), useValue: injectedAnswerRepo },
        { provide: AttemptService, useValue: attemptService },
        { provide: SubmissionService, useValue: submissionService },
        { provide: QUESTION_LOOKUP_SERVICE, useValue: questionLookup },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(AnswerService);
  });

  describe('question-state derivation', () => {
    it('marks a question ANSWERED once it has content', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      const result = await service.saveAnswer('attempt-1', 'q-single', { selectedOptionIds: ['opt-a'] }, student);

      expect(result.state).toBe(QuestionState.ANSWERED);
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'ANSWER_SAVED',
        expect.objectContaining({ attemptId: 'attempt-1', questionId: 'q-single' }),
        student.sub,
      );
    });

    it('marks a question ANSWERED_AND_MARKED_REVIEW when content + review flag are both set', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      const result = await service.saveAnswer(
        'attempt-1',
        'q-single',
        { selectedOptionIds: ['opt-a'], markedForReview: true },
        student,
      );

      expect(result.state).toBe(QuestionState.ANSWERED_AND_MARKED_REVIEW);
    });

    it('marks a question MARKED_REVIEW when reviewed but no content is given', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      const result = await service.saveAnswer('attempt-1', 'q-single', { markedForReview: true }, student);

      expect(result.state).toBe(QuestionState.MARKED_REVIEW);
    });
  });

  describe('clear / review semantics (markedForReview is a toggle, not a full replacement)', () => {
    it('answered + marked review -> clear response (no markedForReview) -> stays marked review', async () => {
      managerAnswerRepo.findOne.mockResolvedValue({
        id: 'answer-1',
        attemptId: 'attempt-1',
        questionId: 'q-single',
        selectedOptionIds: ['opt-a'],
        textResponse: null,
        state: QuestionState.ANSWERED_AND_MARKED_REVIEW,
        answeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.saveAnswer('attempt-1', 'q-single', { clearResponse: true }, student);

      expect(result.selectedOptionIds).toBeNull();
      expect(result.state).toBe(QuestionState.MARKED_REVIEW);
    });

    it('marked review -> clear response + explicit markedForReview=false -> not marked (VISITED)', async () => {
      managerAnswerRepo.findOne.mockResolvedValue({
        id: 'answer-1',
        attemptId: 'attempt-1',
        questionId: 'q-single',
        selectedOptionIds: null,
        textResponse: null,
        state: QuestionState.MARKED_REVIEW,
        answeredAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.saveAnswer(
        'attempt-1',
        'q-single',
        { clearResponse: true, markedForReview: false },
        student,
      );

      expect(result.state).toBe(QuestionState.VISITED);
    });

    it('not marked -> clear response + explicit markedForReview=true -> marked review', async () => {
      managerAnswerRepo.findOne.mockResolvedValue({
        id: 'answer-1',
        attemptId: 'attempt-1',
        questionId: 'q-single',
        selectedOptionIds: ['opt-a'],
        textResponse: null,
        state: QuestionState.ANSWERED,
        answeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.saveAnswer(
        'attempt-1',
        'q-single',
        { clearResponse: true, markedForReview: true },
        student,
      );

      expect(result.selectedOptionIds).toBeNull();
      expect(result.state).toBe(QuestionState.MARKED_REVIEW);
    });
  });

  describe('answer-shape validation against the question', () => {
    it('rejects a text response on an objective (single-choice) question', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.saveAnswer('attempt-1', 'q-single', { textResponse: 'hello' }, student),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects selected option IDs on a subjective (text) question', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.saveAnswer('attempt-1', 'q-text', { selectedOptionIds: ['opt-a'] }, student),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects more than one selected option on a single-choice question', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.saveAnswer('attempt-1', 'q-single', { selectedOptionIds: ['opt-a', 'opt-b'] }, student),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows multiple selected options on a multiple-choice question', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      const result = await service.saveAnswer(
        'attempt-1',
        'q-multi',
        { selectedOptionIds: ['opt-a', 'opt-c'] },
        student,
      );

      expect(result.state).toBe(QuestionState.ANSWERED);
    });

    it('rejects an option ID that does not belong to the question', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.saveAnswer('attempt-1', 'q-single', { selectedOptionIds: ['not-a-real-option'] }, student),
      ).rejects.toThrow(BadRequestException);
    });

    it('bypasses shape validation entirely when clearing a response', async () => {
      managerAnswerRepo.findOne.mockResolvedValue({
        id: 'answer-1',
        attemptId: 'attempt-1',
        questionId: 'q-text',
        selectedOptionIds: null,
        textResponse: 'some previous answer',
        state: QuestionState.ANSWERED,
        answeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // clearResponse alone must never fail shape validation, regardless
      // of question type.
      await expect(
        service.saveAnswer('attempt-1', 'q-text', { clearResponse: true }, student),
      ).resolves.toBeDefined();
    });
  });

  it('rejects an answer for a question that does not belong to the exam', async () => {
    await expect(
      service.saveAnswer('attempt-1', 'not-in-exam', { selectedOptionIds: ['opt-a'] }, student),
    ).rejects.toThrow(BadRequestException);
  });

  describe('listQuestionsForAttempt (the exam screen\'s question list)', () => {
    it("returns the attempt's exam questions from the public lookup", async () => {
      const publicQuestions = [{ id: 'q-single', options: [{ id: 'opt-a' }] }] as any;
      attemptService.findOwnedAttemptOrThrow.mockResolvedValue({ ...attempt, status: AttemptStatus.IN_PROGRESS });
      questionLookup.getPublicQuestionsForExam.mockResolvedValue(publicQuestions);

      await expect(service.listQuestionsForAttempt('attempt-1', student)).resolves.toBe(publicQuestions);
      expect(attemptService.findOwnedAttemptOrThrow).toHaveBeenCalledWith('attempt-1', student);
      expect(questionLookup.getPublicQuestionsForExam).toHaveBeenCalledWith('exam-1');
      // The scoring lookup carries the answer key; it must not feed this endpoint.
      expect(questionLookup.getQuestionsForExam).not.toHaveBeenCalled();
    });

    it("refuses another student's attempt", async () => {
      attemptService.findOwnedAttemptOrThrow.mockRejectedValue(new ForbiddenException());

      await expect(service.listQuestionsForAttempt('attempt-1', student)).rejects.toThrow(ForbiddenException);
      expect(questionLookup.getPublicQuestionsForExam).not.toHaveBeenCalled();
    });

    it('refuses an attempt that has already been submitted', async () => {
      attemptService.findOwnedAttemptOrThrow.mockResolvedValue({ ...attempt, status: AttemptStatus.SUBMITTED });

      await expect(service.listQuestionsForAttempt('attempt-1', student)).rejects.toThrow(ConflictException);
      expect(questionLookup.getPublicQuestionsForExam).not.toHaveBeenCalled();
    });
  });

  describe('locking (writes must go through the same lock submission-finalization uses)', () => {
    it('delegates the fast pre-check to SubmissionService.assertAttemptIsWritable', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      await service.saveAnswer('attempt-1', 'q-single', { selectedOptionIds: ['opt-a'] }, student);

      expect(submissionService.assertAttemptIsWritable).toHaveBeenCalledWith('attempt-1', student);
    });

    it('performs the actual write inside SubmissionService.withLockedInProgressAttempt, via the manager — never the plain injected repository', async () => {
      managerAnswerRepo.findOne.mockResolvedValue(null);

      await service.saveAnswer('attempt-1', 'q-single', { selectedOptionIds: ['opt-a'] }, student);

      expect(submissionService.withLockedInProgressAttempt).toHaveBeenCalledWith('attempt-1', expect.any(Function));
      expect(manager.getRepository).toHaveBeenCalledWith(AnswerEntity);
      expect(managerAnswerRepo.save).toHaveBeenCalled();
      // If this were ever touched, the write would sit outside the lock,
      // reopening the exact race this fix closes.
      expect(injectedAnswerRepo.save).not.toHaveBeenCalled();
    });
  });
});
