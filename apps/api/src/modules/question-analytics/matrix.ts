/**
 * Owner: Person B. Pure computation of the students × questions matrix and
 * per-question stats. No I/O, so every rule is unit-tested.
 *
 * MCQ correctness uses the same exact-set rule as the attempt scorer
 * (computeScore): full marks only when the selected options equal the
 * correct set. Coding cells use the final code submission's score.
 * Swap MCQ scoring for Person A's QuestionScore rows once they exist.
 */

import {
  AttemptStatus,
  QuestionCellState,
  QuestionState,
  QuestionType,
  type AnalyticsCell,
  type AnalyticsQuestion,
  type AnalyticsStudentRow,
  type QuestionStats,
} from '@secure-exam/types';

export interface MatrixQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  options: { id: string; isCorrect: boolean; text?: string }[];
}

export interface MatrixAttempt {
  attemptId: string;
  studentId: string;
  fullName: string;
  email: string;
  status: AttemptStatus;
  startedAt: Date;
  submittedAt: Date | null;
}

export interface MatrixAnswer {
  attemptId: string;
  questionId: string;
  selectedOptionIds: string[] | null;
  textResponse: string | null;
  state: QuestionState;
}

export interface MatrixFinalCode {
  attemptId: string;
  questionId: string;
  score: number;
  passed: number;
  total: number;
  /** False for the 0-score row written when there was no code at all. */
  hasCode: boolean;
}

/** attemptId|questionId of coding questions with a Submit during the attempt. */
export type SubmittedKeys = Set<string>;

export interface MatrixResult {
  questions: AnalyticsQuestion[];
  students: AnalyticsStudentRow[];
  cells: AnalyticsCell[];
  stats: QuestionStats[];
}

const key = (attemptId: string, questionId: string) => `${attemptId}|${questionId}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const OPTION_TYPES = [QuestionType.MCQ_SINGLE, QuestionType.MCQ_MULTI, QuestionType.TRUE_FALSE];

export function isMarked(state: QuestionState | undefined): boolean {
  return state === QuestionState.MARKED_REVIEW || state === QuestionState.ANSWERED_AND_MARKED_REVIEW;
}

export function buildCell(
  q: MatrixQuestion,
  attempt: MatrixAttempt,
  answer: MatrixAnswer | undefined,
  final: MatrixFinalCode | undefined,
  hasSubmit: boolean,
): AnalyticsCell {
  const base = {
    attemptId: attempt.attemptId,
    questionId: q.id,
    maxScore: q.marks,
    markedForReview: isMarked(answer?.state),
  };

  if (OPTION_TYPES.includes(q.type)) {
    const selected = answer?.selectedOptionIds ?? [];
    if (selected.length === 0) return { ...base, state: QuestionCellState.NOT_ANSWERED, score: 0 };
    const correct = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
    const picked = new Set(selected);
    const right = correct.size > 0 && correct.size === picked.size && [...correct].every((id) => picked.has(id));
    return right
      ? { ...base, state: QuestionCellState.CORRECT, score: q.marks }
      : { ...base, state: QuestionCellState.WRONG, score: 0 };
  }

  if (q.type === QuestionType.CODING) {
    if (final) {
      if (!final.hasCode) return { ...base, state: QuestionCellState.NOT_ANSWERED, score: 0 };
      const score = round2(final.score);
      const state =
        score >= q.marks && q.marks > 0
          ? QuestionCellState.CORRECT
          : score > 0
            ? QuestionCellState.PARTIAL
            : QuestionCellState.WRONG;
      return { ...base, state, score };
    }
    const hasDraft = !!answer?.textResponse && answer.textResponse.trim().length > 0;
    if (hasDraft || hasSubmit) return { ...base, state: QuestionCellState.PENDING, score: null };
    return { ...base, state: QuestionCellState.NOT_ANSWERED, score: 0 };
  }

  // Unknown/subjective types: answered or not, never auto-scored here.
  const answered = !!answer?.textResponse?.trim() || (answer?.selectedOptionIds?.length ?? 0) > 0;
  return answered
    ? { ...base, state: QuestionCellState.PENDING, score: null }
    : { ...base, state: QuestionCellState.NOT_ANSWERED, score: 0 };
}

export function buildMatrix(
  questions: MatrixQuestion[],
  attempts: MatrixAttempt[],
  answers: MatrixAnswer[],
  finals: MatrixFinalCode[],
  submitted: SubmittedKeys,
): MatrixResult {
  const answerBy = new Map(answers.map((a) => [key(a.attemptId, a.questionId), a]));
  const finalBy = new Map(finals.map((f) => [key(f.attemptId, f.questionId), f]));
  const maxScore = questions.reduce((s, q) => s + q.marks, 0);

  const cells: AnalyticsCell[] = [];
  const students: AnalyticsStudentRow[] = attempts.map((a) => {
    let score = 0;
    let answeredCount = 0;
    for (const q of questions) {
      const k = key(a.attemptId, q.id);
      const cell = buildCell(q, a, answerBy.get(k), finalBy.get(k), submitted.has(k));
      cells.push(cell);
      if (cell.score !== null) score += cell.score;
      if (cell.state !== QuestionCellState.NOT_ANSWERED) answeredCount++;
    }
    return {
      attemptId: a.attemptId,
      studentId: a.studentId,
      fullName: a.fullName,
      email: a.email,
      status: a.status,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      score: round2(score),
      maxScore,
      answeredCount,
    };
  });

  const stats: QuestionStats[] = questions.map((q) => {
    const qCells = cells.filter((c) => c.questionId === q.id);
    const count = (s: QuestionCellState) => qCells.filter((c) => c.state === s).length;
    const graded = qCells.filter((c) => c.score !== null);
    const correct = count(QuestionCellState.CORRECT);
    const stat: QuestionStats = {
      questionId: q.id,
      attempts: qCells.length,
      answered: qCells.length - count(QuestionCellState.NOT_ANSWERED),
      correct,
      partial: count(QuestionCellState.PARTIAL),
      wrong: count(QuestionCellState.WRONG),
      notAnswered: count(QuestionCellState.NOT_ANSWERED),
      pending: count(QuestionCellState.PENDING),
      averageScore: graded.length ? round2(graded.reduce((s, c) => s + (c.score ?? 0), 0) / graded.length) : null,
      accuracy: graded.length ? round2(correct / graded.length) : null,
    };
    if (OPTION_TYPES.includes(q.type)) {
      const counts: Record<string, number> = Object.fromEntries(q.options.map((o) => [o.id, 0]));
      for (const a of attempts) {
        for (const id of answerBy.get(key(a.attemptId, q.id))?.selectedOptionIds ?? []) {
          if (id in counts) counts[id]++;
        }
      }
      stat.optionCounts = counts;
    }
    if (q.type === QuestionType.CODING) {
      const ran = finals.filter((f) => f.questionId === q.id && f.hasCode && f.total > 0);
      const total = ran.reduce((s, f) => s + f.total, 0);
      stat.testPassRate = total ? round2(ran.reduce((s, f) => s + f.passed, 0) / total) : null;
    }
    return stat;
  });

  return {
    questions: questions.map((q, i) => ({
      id: q.id,
      number: i + 1,
      text: q.text,
      type: q.type,
      marks: q.marks,
      ...(OPTION_TYPES.includes(q.type)
        ? { options: q.options.map((o) => ({ id: o.id, text: o.text ?? '', isCorrect: o.isCorrect })) }
        : {}),
    })),
    students,
    cells,
    stats,
  };
}
