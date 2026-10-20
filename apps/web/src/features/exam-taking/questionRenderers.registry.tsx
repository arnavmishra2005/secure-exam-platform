// [SHARED — Day 1 contract] Question type -> renderer for the exam screen.
// One line per type; append, never reorder. Person B registers:
//   CODING: CodingQuestionView,
// A renderer owns its own answer UI; CODING renderers persist through the
// IOfflineStore v2 code-draft methods instead of the MCQ answer draft.

import { QuestionType } from '@secure-exam/types';
import type { PublicQuestion } from '@secure-exam/types';
import type { ComponentType } from 'react';
import { QuestionRenderer as McqQuestionRenderer } from './components/QuestionRenderer';

export interface QuestionRendererProps {
  attemptId: string;
  question: PublicQuestion;
  questionNumber: number;
  totalQuestions: number;
  /** MCQ draft (objective types). */
  selectedOptionIds: string[];
  textResponse: string;
  onSelectOption: (optionId: string, isMulti: boolean) => void;
  onTextResponseChange: (text: string) => void;
  disabled?: boolean;
}

function McqRenderer({ attemptId: _attemptId, ...props }: QuestionRendererProps) {
  return <McqQuestionRenderer {...props} />;
}

export const questionRenderers: Record<string, ComponentType<QuestionRendererProps>> = {
  [QuestionType.MCQ_SINGLE]: McqRenderer,
  [QuestionType.MCQ_MULTI]: McqRenderer,
  [QuestionType.TRUE_FALSE]: McqRenderer,
};
