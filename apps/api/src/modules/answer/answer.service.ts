import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { AnswerEntity } from './entities/answer.entity';
import { AttemptStatus, QuestionState } from '@secure-exam/types';
import type { Answer, JwtPayload, PublicQuestion } from '@secure-exam/types';
import { SaveAnswerDto } from '@secure-exam/validation';
import { AttemptService } from '../attempt/attempt.service';
import { SubmissionService } from './submission.service';
import {
  IQuestionLookupService,
  QUESTION_LOOKUP_SERVICE,
  QuestionLookupInfo,
} from './question-lookup/question-lookup.interface';
// Person A's contract (assumed to exist — task-breakdown doc, section 3).
import { AuditService } from '../audit/audit.service';
import { logAuditSafely } from '../attempt/audit-safe.util';

@Injectable()
export class AnswerService {
  private readonly logger = new Logger(AnswerService.name);

  constructor(
    @InjectRepository(AnswerEntity) private readonly answerRepository: Repository<AnswerEntity>,
    private readonly attemptService: AttemptService,
    private readonly submissionService: SubmissionService,
    @Inject(QUESTION_LOOKUP_SERVICE) private readonly questionLookup: IQuestionLookupService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Save/update an answer for one question in an attempt.
   *
   * Two layers of guarding before anything is written:
   *  1. `assertAttemptIsWritable` — a fast, unlocked ownership/status/
   *     expiry pre-check (and triggers auto-submit-on-expiry as a side
   *     effect if needed).
   *  2. `withLockedInProgressAttempt` — the actual write happens inside
   *     this, which takes the SAME row lock submission-finalization uses.
   *     This is what prevents an answer from silently being written after
   *     (or lost around) a concurrent submit — see that method's doc
   *     comment in submission.service.ts for the full reasoning.
   *
   * Question-shape validation (`validateAnswerContent`) runs before the
   * lock is acquired — it only needs the question's own (immutable)
   * metadata, not attempt state, so there's no reason to hold a lock for it.
   */
  async saveAnswer(
    attemptId: string,
    questionId: string,
    dto: SaveAnswerDto,
    user: JwtPayload,
  ): Promise<Answer> {
    const attempt = await this.submissionService.assertAttemptIsWritable(attemptId, user);

    const questions = await this.questionLookup.getQuestionsForExam(attempt.examId);
    const question = questions.find((q) => q.id === questionId);
    if (!question) {
      throw new BadRequestException("This question does not belong to the attempt's exam");
    }
    this.validateAnswerContent(question, dto);

    const saved = await this.submissionService.withLockedInProgressAttempt(
      attemptId,
      async (manager: EntityManager) => {
        const answerRepo = manager.getRepository(AnswerEntity);
        let answer = await answerRepo.findOne({ where: { attemptId, questionId } });
        if (!answer) {
          answer = answerRepo.create({
            attemptId,
            questionId,
            selectedOptionIds: null,
            textResponse: null,
            state: QuestionState.NOT_VISITED,
            answeredAt: null,
          });
        }

        this.applyAnswerUpdate(answer, dto);
        return answerRepo.save(answer);
      },
    );

    await logAuditSafely(
      this.logger,
      this.auditService,
      'ANSWER_SAVED',
      { attemptId, questionId, state: saved.state },
      user.sub,
    );

    return toAnswerDto(saved);
  }

  /** Read-only: used by the exam UI's question palette and by admin monitoring detail views. */
  async listForAttempt(attemptId: string, user: JwtPayload): Promise<Answer[]> {
    await this.attemptService.findOwnedAttemptOrThrow(attemptId, user);
    const answers = await this.answerRepository.find({ where: { attemptId } });
    return answers.map(toAnswerDto);
  }

  /**
   * The exam-taking screen's question list: the attempt's exam questions
   * without the answer key. Only the attempt's owner can read it, and only
   * while the attempt is in progress.
   */
  async listQuestionsForAttempt(attemptId: string, user: JwtPayload): Promise<PublicQuestion[]> {
    const attempt = await this.attemptService.findOwnedAttemptOrThrow(attemptId, user);
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException('This attempt is no longer in progress');
    }
    return this.questionLookup.getPublicQuestionsForExam(attempt.examId);
  }

  /**
   * Validates the submitted answer content against the question's own
   * shape — independent of, and in addition to, class-validator's DTO-level
   * checks (which can't know per-question rules like "single-choice allows
   * at most one option"). Only meaningful once real per-question metadata
   * exists; the mock question-lookup fixtures expose enough of it
   * (answerFormat, optionIds) to exercise every branch here today.
   */
  private validateAnswerContent(question: QuestionLookupInfo, dto: SaveAnswerDto): void {
    if (dto.clearResponse) return; // clearing is always valid, regardless of question type

    const hasOptionIds = dto.selectedOptionIds !== undefined && dto.selectedOptionIds.length > 0;
    const hasText = dto.textResponse !== undefined && dto.textResponse.trim().length > 0;

    if (question.answerFormat === 'TEXT') {
      if (hasOptionIds) {
        throw new BadRequestException('This is a descriptive question — selectedOptionIds is not valid here');
      }
      return;
    }

    // SINGLE_CHOICE or MULTIPLE_CHOICE from here on.
    if (hasText) {
      throw new BadRequestException('This is an objective question — textResponse is not valid here');
    }

    if (dto.selectedOptionIds !== undefined) {
      const validIds = new Set(question.optionIds ?? []);
      const invalid = dto.selectedOptionIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Selected option(s) do not belong to this question: ${invalid.join(', ')}`,
        );
      }
      if (question.answerFormat === 'SINGLE_CHOICE' && dto.selectedOptionIds.length > 1) {
        throw new BadRequestException('This question allows only one selected option');
      }
    }
  }

  /**
   * Mutates `answer` in place according to `dto`, and derives its
   * QuestionState. Question-state derivation rules:
   *
   *  - Content (selectedOptionIds/textResponse) is only ever changed when
   *    the corresponding field is present in the request, or cleared via
   *    `clearResponse` — an omitted field leaves existing content alone.
   *  - `markedForReview`, when PRESENT in the request (true or false),
   *    explicitly sets the review flag. When ABSENT, the answer's current
   *    review flag is PRESERVED — in particular, sending `clearResponse:
   *    true` on its own does not silently unmark a question that was
   *    already marked for review. This was a real bug in the previous
   *    version of this method (clearing a response always reset the
   *    review flag to "not marked" unless the client happened to also
   *    resend `markedForReview: true`); see answer.service.spec.ts for the
   *    three scenarios this fixes.
   */
  private applyAnswerUpdate(answer: AnswerEntity, dto: SaveAnswerDto): void {
    const wasMarkedForReview =
      answer.state === QuestionState.MARKED_REVIEW || answer.state === QuestionState.ANSWERED_AND_MARKED_REVIEW;
    const isMarkedForReview = dto.markedForReview ?? wasMarkedForReview;

    if (dto.clearResponse) {
      answer.selectedOptionIds = null;
      answer.textResponse = null;
    } else {
      if (dto.selectedOptionIds !== undefined) answer.selectedOptionIds = dto.selectedOptionIds;
      if (dto.textResponse !== undefined) answer.textResponse = dto.textResponse;
    }

    const hasContent =
      (!!answer.selectedOptionIds && answer.selectedOptionIds.length > 0) ||
      (!!answer.textResponse && answer.textResponse.trim().length > 0);

    if (hasContent) {
      answer.state = isMarkedForReview ? QuestionState.ANSWERED_AND_MARKED_REVIEW : QuestionState.ANSWERED;
      answer.answeredAt = new Date();
    } else {
      answer.state = isMarkedForReview ? QuestionState.MARKED_REVIEW : QuestionState.VISITED;
      answer.answeredAt = null;
    }
  }
}

export function toAnswerDto(entity: AnswerEntity): Answer {
  return {
    id: entity.id,
    attemptId: entity.attemptId,
    questionId: entity.questionId,
    selectedOptionIds: entity.selectedOptionIds,
    textResponse: entity.textResponse,
    state: entity.state,
    answeredAt: entity.answeredAt ? entity.answeredAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
