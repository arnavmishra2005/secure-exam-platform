/**
 * Owner: Person B. Option rules per objective question type, shared by the
 * legacy question endpoints, the question bank and CSV import.
 */

import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@secure-exam/types';

export interface OptionLike {
  text: string;
  isCorrect: boolean;
}

/**
 *  - MCQ_SINGLE: at least two options, exactly one correct
 *  - MCQ_MULTI: at least two options, at least one correct
 *  - TRUE_FALSE: exactly two options, exactly one correct
 *  - anything else (incl. CODING): not an option-based type
 */
export function validateOptionsForType(type: QuestionType, options: OptionLike[] | undefined): void {
  if (!options || options.length < 2) {
    throw new BadRequestException('A question needs at least two options');
  }
  if (options.some((o) => !o.text || o.text.trim().length === 0)) {
    throw new BadRequestException('Options cannot be empty');
  }
  const correctCount = options.filter((o) => o.isCorrect).length;

  switch (type) {
    case QuestionType.MCQ_SINGLE:
      if (correctCount !== 1) {
        throw new BadRequestException('MCQ_SINGLE requires exactly one correct option');
      }
      break;
    case QuestionType.MCQ_MULTI:
      if (correctCount < 1) {
        throw new BadRequestException('MCQ_MULTI requires at least one correct option');
      }
      break;
    case QuestionType.TRUE_FALSE:
      if (options.length !== 2 || correctCount !== 1) {
        throw new BadRequestException('TRUE_FALSE requires exactly two options, one correct');
      }
      break;
    default:
      throw new BadRequestException(`Unknown question type: ${type}`);
  }
}

export function isOptionType(type: QuestionType): boolean {
  return type === QuestionType.MCQ_SINGLE || type === QuestionType.MCQ_MULTI || type === QuestionType.TRUE_FALSE;
}
