/**
 * Owner: Person B. The only file in question-analytics that reads other
 * owners' tables (attempts, answers, users). Read-only. camelCase columns
 * on those tables are double-quoted.
 */

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AttemptStatus, QuestionState } from '@secure-exam/types';
import type { MatrixAnswer, MatrixAttempt } from './matrix';

@Injectable()
export class ExamAttemptDataAdapter {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Every attempt at the exam, with the student's name and email, oldest first. */
  async attempts(examId: string, attemptId?: string): Promise<MatrixAttempt[]> {
    const rows: Array<{
      attemptId: string;
      studentId: string;
      fullName: string | null;
      email: string | null;
      status: AttemptStatus;
      startedAt: Date;
      submittedAt: Date | null;
    }> = await this.dataSource.query(
      `
      SELECT a.id AS "attemptId", a."studentId", u."fullName", u.email, a.status, a."startedAt", a."submittedAt"
      FROM attempts a
      LEFT JOIN users u ON u.id = a."studentId"
      WHERE a."examId" = $1 ${attemptId ? 'AND a.id = $2' : ''}
      ORDER BY u."fullName" ASC NULLS LAST, a."startedAt" ASC
      `,
      attemptId ? [examId, attemptId] : [examId],
    );
    return rows.map((r) => ({
      ...r,
      fullName: r.fullName ?? '(deleted user)',
      email: r.email ?? '',
      startedAt: new Date(r.startedAt),
      submittedAt: r.submittedAt ? new Date(r.submittedAt) : null,
    }));
  }

  async answers(attemptIds: string[]): Promise<Array<MatrixAnswer & { answeredAt: Date | null }>> {
    if (attemptIds.length === 0) return [];
    const rows: Array<{
      attemptId: string;
      questionId: string;
      selectedOptionIds: string[] | null;
      textResponse: string | null;
      state: QuestionState;
      answeredAt: Date | null;
    }> = await this.dataSource.query(
      `
      SELECT "attemptId", "questionId", "selectedOptionIds", "textResponse", state, "answeredAt"
      FROM answers
      WHERE "attemptId" = ANY($1::uuid[])
      `,
      [attemptIds],
    );
    return rows.map((r) => ({ ...r, answeredAt: r.answeredAt ? new Date(r.answeredAt) : null }));
  }
}
