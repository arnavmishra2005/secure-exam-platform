/**
 * Owner: Person C.
 *
 * C's own abstraction over Person B's Question domain — used to (a)
 * validate that a saved answer's questionId actually belongs to the
 * attempt's exam, (b) validate the *shape* of the submitted answer against
 * the question's type (objective vs subjective, single- vs multi-select,
 * option IDs actually belonging to the question), and (c) auto-score
 * objective questions on submission.
 *
 * Deliberately decoupled from B's real QuestionType enum (which C doesn't
 * control) via `answerFormat` below — the eventual adapter maps B's actual
 * question types onto this abstraction.
 */

export const QUESTION_LOOKUP_SERVICE = Symbol('QUESTION_LOOKUP_SERVICE');

export type QuestionAnswerFormat = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT';

export interface QuestionLookupInfo {
  id: string;
  marks: number;
  answerFormat: QuestionAnswerFormat;
  /** All valid option IDs for this question. Present iff answerFormat is SINGLE_CHOICE or MULTIPLE_CHOICE. */
  optionIds?: string[];
  /** Correct option ID(s), a subset of optionIds. Present iff answerFormat is SINGLE_CHOICE or MULTIPLE_CHOICE. */
  correctOptionIds?: string[];
}

/** SINGLE_CHOICE and MULTIPLE_CHOICE are auto-gradeable; TEXT is not. */
export function isObjective(format: QuestionAnswerFormat): boolean {
  return format === 'SINGLE_CHOICE' || format === 'MULTIPLE_CHOICE';
}

export interface IQuestionLookupService {
  /** All questions belonging to an exam, used for answer validation + scoring. */
  getQuestionsForExam(examId: string): Promise<QuestionLookupInfo[]>;
}
