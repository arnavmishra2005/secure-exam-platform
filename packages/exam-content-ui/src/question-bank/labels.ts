/** Owner: Person B. Display labels for bank enums. */
import { QuestionDifficulty, QuestionStatus, QuestionType } from '@secure-exam/types';

export const TYPE_LABEL: Record<QuestionType, string> = {
  [QuestionType.MCQ_SINGLE]: 'Single choice',
  [QuestionType.MCQ_MULTI]: 'Multiple choice',
  [QuestionType.TRUE_FALSE]: 'True / False',
  [QuestionType.CODING]: 'Coding',
};

export const DIFFICULTY_LABEL: Record<QuestionDifficulty, { text: string; tone: 'green' | 'amber' | 'red' }> = {
  [QuestionDifficulty.EASY]: { text: 'Easy', tone: 'green' },
  [QuestionDifficulty.MEDIUM]: { text: 'Medium', tone: 'amber' },
  [QuestionDifficulty.HARD]: { text: 'Hard', tone: 'red' },
};

export const STATUS_LABEL: Record<QuestionStatus, { text: string; tone: 'neutral' | 'green' | 'amber' }> = {
  [QuestionStatus.DRAFT]: { text: 'Draft', tone: 'amber' },
  [QuestionStatus.READY]: { text: 'Ready', tone: 'green' },
  [QuestionStatus.ARCHIVED]: { text: 'Archived', tone: 'neutral' },
};

/** A course as the host app knows it (Person A's courses). */
export interface CourseOption {
  id: string;
  name: string;
}
