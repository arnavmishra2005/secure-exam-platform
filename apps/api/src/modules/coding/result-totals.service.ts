/**
 * Owner: Person B.
 *
 * Recomputes one finished attempt's total from scratch with the current
 * questions: MCQ by the exact-set rule, coding from the final code
 * submissions. Uses the same cell rules as question-wise results
 * (question-analytics/matrix.ts), so the two always agree.
 * Only used after a professor edits questions and recalculates.
 */
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AttemptStatus, CodeSubmissionStatus } from '@secure-exam/types';
import { buildCell, type MatrixQuestion } from '../question-analytics/matrix';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { ATTEMPT_ACCESS, IAttemptAccess } from './attempt-access/attempt-access.interface';
import { CodeSubmissionEntity } from './entities/code-submission.entity';
import { CODE_SCORE_SINK, ICodeScoreSink } from './score-sink/code-score-sink.interface';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ResultTotalsService {
  constructor(
    @Inject(ATTEMPT_ACCESS) private readonly attempts: IAttemptAccess,
    @Inject(CODE_SCORE_SINK) private readonly scoreSink: ICodeScoreSink,
    @InjectRepository(ExamQuestionEntity) private readonly examQuestionRepo: Repository<ExamQuestionEntity>,
    @InjectRepository(QuestionEntity) private readonly questionRepo: Repository<QuestionEntity>,
  ) {}

  /** The exam's questions with options, in exam order. */
  async examQuestions(examId: string): Promise<MatrixQuestion[]> {
    const mappings = await this.examQuestionRepo.find({ where: { examId }, order: { order: 'ASC' } });
    if (mappings.length === 0) return [];
    const questions = await this.questionRepo.find({
      where: { id: In(mappings.map((m) => m.questionId)) },
      relations: ['options'],
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    return mappings
      .map((m) => byId.get(m.questionId))
      .filter((q): q is QuestionEntity => !!q)
      .map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        marks: q.marks,
        options: (q.options ?? []).map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      }));
  }

  /** Writes the recomputed total inside `manager`'s transaction. */
  async recompute(manager: EntityManager, examId: string, attemptId: string, questions?: MatrixQuestion[]) {
    const qs = questions ?? (await this.examQuestions(examId));
    const answers = await this.attempts.getAnswers(attemptId);
    const finals = await manager.getRepository(CodeSubmissionEntity).find({
      where: { attemptId, isFinal: true, status: CodeSubmissionStatus.GRADED },
    });
    const answerBy = new Map(answers.map((a) => [a.questionId, { ...a, attemptId }]));
    const finalBy = new Map(finals.map((f) => [f.questionId, f]));
    const attempt = {
      attemptId,
      studentId: '',
      fullName: '',
      email: '',
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date(0),
      submittedAt: new Date(0),
    };

    let score = 0;
    for (const q of qs) {
      const f = finalBy.get(q.id);
      const cell = buildCell(
        q,
        attempt,
        answerBy.get(q.id),
        f ? { attemptId, questionId: q.id, score: f.score, passed: f.passed, total: f.total, hasCode: f.code.trim().length > 0 } : undefined,
        false,
      );
      score += cell.score ?? 0;
    }
    const maxScore = qs.reduce((sum, q) => sum + q.marks, 0);
    await this.scoreSink.replaceTotals(manager, attemptId, round2(score), maxScore);
  }
}
