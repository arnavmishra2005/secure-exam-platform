import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AttemptStatus } from '@secure-exam/types';
import type { JwtPayload } from '@secure-exam/types';
import { AnswerEntity } from '../../answer/entities/answer.entity';
import { SubmissionService } from '../../answer/submission.service';
import {
  AttemptAnswer,
  FinishedAttempt,
  IAttemptAccess,
  PendingCodeGrade,
  WritableAttempt,
} from './attempt-access.interface';

/**
 * The only file in the coding module that knows the attempt/answer
 * tables. Write checks reuse the answer module's own guard, so the rules
 * can't drift. Note the camelCase (quoted) columns on attempts/answers and
 * snake_case on B's tables.
 */
@Injectable()
export class AttemptAccessAdapter implements IAttemptAccess {
  constructor(
    private readonly submissionService: SubmissionService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async assertWritable(attemptId: string, user: JwtPayload): Promise<WritableAttempt> {
    const attempt = await this.submissionService.assertAttemptIsWritable(attemptId, user);
    return { id: attempt.id, examId: attempt.examId, studentId: attempt.studentId };
  }

  async findAwaitingCodeGrading(limit: number): Promise<PendingCodeGrade[]> {
    const rows: Array<{
      attemptId: string;
      examId: string;
      studentId: string;
      questionId: string;
      submittedAt: Date;
    }> = await this.dataSource.query(
      `
      SELECT a.id AS "attemptId", a."examId", a."studentId", q.id AS "questionId", a."submittedAt"
      FROM attempts a
      JOIN exam_questions eq ON eq.exam_id = a."examId"
      JOIN questions q ON q.id = eq.question_id AND q.type = 'CODING'
      WHERE a.status IN ($1, $2)
        AND a."submittedAt" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM code_submissions cs
          WHERE cs.attempt_id = a.id AND cs.question_id = q.id AND cs.is_final
        )
      ORDER BY a."submittedAt" ASC
      LIMIT $3
      `,
      [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED, limit],
    );
    return rows.map((r) => ({ ...r, submittedAt: new Date(r.submittedAt) }));
  }

  async getDraftCode(attemptId: string, questionId: string): Promise<string | null> {
    const answer = await this.dataSource
      .getRepository(AnswerEntity)
      .findOne({ where: { attemptId, questionId } });
    return answer?.textResponse ?? null;
  }

  async listFinishedAttempts(examId: string, attemptIds?: string[]): Promise<FinishedAttempt[]> {
    const rows: Array<{ attemptId: string; examId: string; studentId: string; submittedAt: Date }> =
      await this.dataSource.query(
        `
        SELECT a.id AS "attemptId", a."examId", a."studentId", a."submittedAt"
        FROM attempts a
        WHERE a."examId" = $1 AND a.status IN ($2, $3) AND a."submittedAt" IS NOT NULL
          ${attemptIds ? 'AND a.id = ANY($4::uuid[])' : ''}
        `,
        attemptIds
          ? [examId, AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED, attemptIds]
          : [examId, AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED],
      );
    return rows.map((r) => ({ ...r, submittedAt: new Date(r.submittedAt) }));
  }

  async getFinishedAttempt(attemptId: string): Promise<FinishedAttempt | null> {
    const rows: Array<{ examId: string }> = await this.dataSource.query(`SELECT "examId" FROM attempts WHERE id = $1`, [
      attemptId,
    ]);
    if (!rows[0]) return null;
    const [attempt] = await this.listFinishedAttempts(rows[0].examId, [attemptId]);
    return attempt ?? null;
  }

  async getAnswers(attemptId: string): Promise<AttemptAnswer[]> {
    const rows = await this.dataSource.getRepository(AnswerEntity).find({ where: { attemptId } });
    return rows.map((a) => ({
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
      textResponse: a.textResponse,
      state: a.state,
    }));
  }
}
