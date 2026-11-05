/**
 * Owner: Person B (#13). Manual mark adjustment for one question of one
 * finished attempt, like Moodle's "Make comment or override mark" on a quiz
 * review: the marker sees the automatic score, sets a new mark (or adds/takes
 * away marks) and must give a reason.
 *
 * The adjustment is stored next to the automatic score in `question_scores`
 * (Person A's table): score = clamp(autoScore + manualAdjustment, 0, maxScore).
 * Re-grading changes only autoScore, so the adjustment survives it (the
 * ScoreRecorder and ResultTotalsService both re-apply it). The attempt's
 * total is recomputed in the same transaction. Every change is audited
 * (SCORE_ADJUSTED) with the old and new values.
 *
 * Admin only today; after Person A's #1 it becomes MARKS_ADJUST on the
 * exam's course (docs/merge-notes-person-b.md).
 */
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AttemptStatus,
  AuditEventType,
  QuestionType,
  ScoreSource,
  type AdjustQuestionScoreRequest,
  type AdjustQuestionScoreResponse,
  type ScoreAdjustmentInfo,
} from '@secure-exam/types';
import { AuditService } from '../audit/audit.service';
import { ResultTotalsService } from '../coding/result-totals.service';
import { QuestionScoreEntity } from '../results/entities/question-score.entity';
import { QuestionAnalyticsService } from './question-analytics.service';

const round2 = (n: number) => Math.round(n * 100) / 100;
const FINISHED = [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED];

@Injectable()
export class ScoreAdjustmentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly analytics: QuestionAnalyticsService,
    private readonly totals: ResultTotalsService,
    private readonly audit: AuditService,
  ) {}

  async adjust(
    examId: string,
    attemptId: string,
    questionId: string,
    dto: AdjustQuestionScoreRequest,
    actorId: string,
  ): Promise<AdjustQuestionScoreResponse> {
    if ((dto.score === undefined) === (dto.adjustment === undefined)) {
      throw new BadRequestException('Give either the new score or an adjustment, not both');
    }
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('Give a reason for the change');

    const { attempt, question, cell } = await this.analytics.autoCell(examId, attemptId, questionId);
    if (!FINISHED.includes(attempt.status)) throw new ConflictException("The attempt hasn't finished yet");
    if (cell.score === null) {
      throw new ConflictException('This answer is still being graded. Adjust it once grading has finished.');
    }

    const auto = cell.score;
    const adjustment = round2(dto.score !== undefined ? dto.score - auto : dto.adjustment!);
    const score = round2(auto + adjustment);
    if (score < 0 || score > question.marks) {
      throw new BadRequestException(
        `The score must be between 0 and ${question.marks} (the automatic score is ${auto})`,
      );
    }

    const now = new Date();
    const old = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(QuestionScoreEntity);
      const existing = await repo.findOne({ where: { attemptId, questionId }, lock: { mode: 'pessimistic_write' } });
      const fields = {
        autoScore: auto,
        score,
        isCorrect: question.marks > 0 && score >= question.marks,
        manualAdjustment: adjustment,
        adjustedBy: adjustment !== 0 ? actorId : null,
        adjustedAt: adjustment !== 0 ? now : null,
        adjustReason: adjustment !== 0 ? reason : null,
      };
      if (existing) {
        await repo.update({ id: existing.id }, fields);
      } else if (adjustment !== 0) {
        await repo.insert({
          attemptId,
          examId,
          studentId: attempt.studentId,
          questionId,
          source: question.type === QuestionType.CODING ? ScoreSource.AUTO_CODE : ScoreSource.AUTO_MCQ,
          maxScore: question.marks,
          ...fields,
        });
      }
      await this.totals.recompute(manager, examId, attemptId);
      return { adjustment: existing?.manualAdjustment ?? 0, score: existing?.score ?? auto };
    });

    await this.audit.logEvent(
      AuditEventType.SCORE_ADJUSTED,
      {
        examId,
        attemptId,
        questionId,
        studentId: attempt.studentId,
        autoScore: auto,
        oldAdjustment: old.adjustment,
        newAdjustment: adjustment,
        oldScore: old.score,
        newScore: score,
        maxScore: question.marks,
        reason,
      },
      actorId,
    );

    const total = await this.analytics.attemptTotal(examId, attemptId);
    const info: ScoreAdjustmentInfo | null =
      adjustment !== 0
        ? {
            autoScore: auto,
            adjustment,
            reason,
            adjustedBy: actorId,
            adjustedByName: (await this.analytics.userNames([actorId])).get(actorId) ?? null,
            adjustedAt: now.toISOString(),
          }
        : null;
    return { questionId, autoScore: auto, score, maxScore: question.marks, adjustment: info, total };
  }
}
