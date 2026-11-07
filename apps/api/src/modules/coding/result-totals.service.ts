/**
 * Owner: Person B.
 *
 * Recomputes one finished attempt from scratch with the current questions:
 * objective questions by the exact-set rule (with negative marks), coding
 * from the final code submissions. Uses the same cell rules as question-wise
 * results (question-analytics/matrix.ts), so the two always agree.
 *
 * Every question's automatic score is written to question_scores through
 * Person A's ScoreRecorder (which re-applies manual adjustments), so the
 * per-question marks students see in their review match the new total.
 * Used by "Recalculate results" and when a queued coding answer is re-run.
 */
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AttemptStatus, CodeSubmissionStatus, QuestionType, ScoreSource } from '@secure-exam/types';
import { SCORE_RECORDER, type RecordScoreInput, type ScoreRecorder } from '../../common/scoring/score-recorder.interface';
import { applyAdjustment, buildCell, type MatrixQuestion } from '../question-analytics/matrix';
import { QuestionScoreEntity } from '../results/entities/question-score.entity';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { ATTEMPT_ACCESS, IAttemptAccess } from './attempt-access/attempt-access.interface';
import { CodeSubmissionEntity } from './entities/code-submission.entity';
import { CODE_SCORE_SINK, ICodeScoreSink } from './score-sink/code-score-sink.interface';

const round2 = (n: number) => Math.round(n * 100) / 100;
const OBJECTIVE = new Set([QuestionType.MCQ_SINGLE, QuestionType.MCQ_MULTI, QuestionType.TRUE_FALSE]);

@Injectable()
export class ResultTotalsService {
  constructor(
    @Inject(ATTEMPT_ACCESS) private readonly attempts: IAttemptAccess,
    @Inject(CODE_SCORE_SINK) private readonly scoreSink: ICodeScoreSink,
    @InjectRepository(ExamQuestionEntity) private readonly examQuestionRepo: Repository<ExamQuestionEntity>,
    @InjectRepository(QuestionEntity) private readonly questionRepo: Repository<QuestionEntity>,
    @Inject(SCORE_RECORDER) private readonly scores: ScoreRecorder,
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
        negativeMarks: q.negativeMarks,
        options: (q.options ?? []).map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      }));
  }

  /** Writes the recomputed question scores and total inside `manager`'s transaction. */
  async recompute(manager: EntityManager, examId: string, attemptId: string, questions?: MatrixQuestion[]) {
    const qs = questions ?? (await this.examQuestions(examId));
    const answers = await this.attempts.getAnswers(attemptId);
    const finals = await manager.getRepository(CodeSubmissionEntity).find({
      where: { attemptId, isFinal: true, status: CodeSubmissionStatus.GRADED },
    });
    // Manual adjustments (#13) survive a recalculation: they are added to the new automatic scores.
    const adjusted = await manager
      .getRepository(QuestionScoreEntity)
      .createQueryBuilder('qs')
      .select(['qs.questionId', 'qs.manualAdjustment'])
      .where('qs.attemptId = :attemptId AND qs.manualAdjustment <> 0', { attemptId })
      .getMany();
    const adjustmentBy = new Map(adjusted.map((a) => [a.questionId, a.manualAdjustment]));
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
    const rows: Omit<RecordScoreInput, 'attemptId'>[] = [];
    for (const q of qs) {
      const f = finalBy.get(q.id);
      const final = f
        ? { attemptId, questionId: q.id, score: f.score, passed: f.passed, total: f.total, hasCode: f.code.trim().length > 0 }
        : undefined;
      const answer = answerBy.get(q.id);
      const auto = buildCell(q, attempt, answer, final, false);
      score += applyAdjustment(auto, adjustmentBy.get(q.id)).score ?? 0;
      if (auto.score === null) continue; // not gradeable yet (e.g. code still queued)
      if (OBJECTIVE.has(q.type)) {
        const selected = answer?.selectedOptionIds ?? [];
        rows.push({
          questionId: q.id,
          source: ScoreSource.AUTO_MCQ,
          score: auto.score,
          maxScore: q.marks,
          isCorrect: selected.length === 0 ? null : auto.score >= q.marks && q.marks > 0,
          details: { selectedOptionIds: selected },
        });
      } else if (q.type === QuestionType.CODING) {
        rows.push({
          questionId: q.id,
          source: ScoreSource.AUTO_CODE,
          score: auto.score,
          maxScore: q.marks,
          isCorrect: q.marks > 0 && auto.score >= q.marks,
        });
      }
    }

    // Questions no longer in the exam must not count any more.
    const current = qs.map((q) => q.id);
    const stale = manager.getRepository(QuestionScoreEntity).createQueryBuilder().delete().where('"attemptId" = :attemptId', { attemptId });
    if (current.length) stale.andWhere('"questionId" NOT IN (:...current)', { current });
    await stale.execute();
    await this.scores.recordMany(attemptId, rows, manager);

    const maxScore = qs.reduce((sum, q) => sum + q.marks, 0);
    await this.scoreSink.replaceTotals(manager, attemptId, round2(score), maxScore);
  }
}
