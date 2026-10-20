/**
 * Owner: Person B (Question Bank, Code Editor, Question-wise Results)
 *
 * CONTRACT ONLY (Day 1 morning). Shapes agreed so A and C can reference
 * them; Person B implements the entities, migrations and endpoints.
 */

export enum QuestionDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

export enum QuestionStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  ARCHIVED = 'ARCHIVED',
}

export interface Topic {
  id: string;
  /** Course.id the topic belongs to, or null for a shared topic. */
  courseId: string | null;
  name: string;
  createdAt: string;
}

export interface QuestionTag {
  id: string;
  questionId: string;
  tag: string;
}

/** Fields Person B adds to Question (all nullable for existing rows). */
export interface QuestionBankFields {
  courseId: string | null;
  topicId: string | null;
  difficulty: QuestionDifficulty | null;
  status: QuestionStatus;
  tags: string[];
}

export interface QuestionBankFilter {
  search?: string;
  courseId?: string;
  topicId?: string;
  difficulty?: QuestionDifficulty;
  status?: QuestionStatus;
  tag?: string;
  type?: string;
  page?: number;
  limit?: number;
}

/** Who answered what: one cell of the students x questions matrix. */
export enum AnswerMatrixCell {
  NOT_ANSWERED = 'NOT_ANSWERED',
  ANSWERED = 'ANSWERED',
  MARKED = 'MARKED',
  CORRECT = 'CORRECT',
  INCORRECT = 'INCORRECT',
}
