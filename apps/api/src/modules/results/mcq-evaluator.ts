// Owner: Person A (Platform, Courses, Publish, Results)
// Pure grading rules for objective questions — no I/O, unit tested.

import { QuestionType, ScoreSource } from '@secure-exam/types';
import type { RecordScoreInput } from '../../common/scoring/score-recorder.interface';

export const OBJECTIVE_TYPES: ReadonlySet<string> = new Set([
  QuestionType.MCQ_SINGLE,
  QuestionType.MCQ_MULTI,
  QuestionType.TRUE_FALSE,
]);

export interface GradableQuestion {
  id: string;
  type: string;
  marks: number;
  negativeMarks?: number | null;
  options: { id: string; isCorrect: boolean }[];
}

export interface GradableAnswer {
  questionId: string;
  selectedOptionIds: string[] | null;
}

/**
 * Exact-set match earns full marks; any other non-empty selection loses
 * `negativeMarks` (0 when unset); no selection scores 0. No partial credit
 * for multi-select. Non-objective questions (e.g. CODING) are skipped —
 * their graders record their own scores.
 */
export function evaluateObjectiveAnswers(
  questions: GradableQuestion[],
  answers: GradableAnswer[],
): Omit<RecordScoreInput, 'attemptId'>[] {
  const answerBy = new Map(answers.map((a) => [a.questionId, a]));

  return questions
    .filter((q) => OBJECTIVE_TYPES.has(q.type))
    .map((q) => {
      const selected = [...new Set(answerBy.get(q.id)?.selectedOptionIds ?? [])];
      const correct = q.options.filter((o) => o.isCorrect).map((o) => o.id);

      if (selected.length === 0) {
        return {
          questionId: q.id,
          source: ScoreSource.AUTO_MCQ,
          score: 0,
          maxScore: q.marks,
          isCorrect: null,
          details: { selectedOptionIds: [] },
        };
      }

      const correctSet = new Set(correct);
      const isCorrect = correct.length > 0 && selected.length === correct.length && selected.every((id) => correctSet.has(id));
      return {
        questionId: q.id,
        source: ScoreSource.AUTO_MCQ,
        score: isCorrect ? q.marks : -(q.negativeMarks ?? 0),
        maxScore: q.marks,
        isCorrect,
        details: { selectedOptionIds: selected },
      };
    });
}
