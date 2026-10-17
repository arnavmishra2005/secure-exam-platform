import { Injectable } from '@nestjs/common';
import { QuestionService } from '../../question/question.service';
import { CodingContentService } from '../../coding/coding-content.service';
import {
  IQuestionLookupService,
  QuestionAnswerFormat,
  QuestionLookupInfo,
} from './question-lookup.interface';
import { QuestionType } from '@secure-exam/types';
import type { PublicQuestion } from '@secure-exam/types';

@Injectable()
export class QuestionLookupAdapter implements IQuestionLookupService {
  constructor(
    private readonly questionService: QuestionService,
    private readonly codingContent: CodingContentService,
  ) {}

  async getQuestionsForExam(examId: string): Promise<QuestionLookupInfo[]> {
    try {
      const questions = await this.questionService.getExamQuestions(examId);
      return questions.map((q) => {
        const answerFormat = toAnswerFormat(q.type);

        const optionIds = q.options?.map((o) => o.id) ?? [];
        const correctOptionIds = q.options?.filter((o) => o.isCorrect).map((o) => o.id) ?? [];

        return {
          id: q.id,
          marks: q.marks,
          answerFormat,
          optionIds,
          correctOptionIds,
        };
      });
    } catch {
      return [];
    }
  }

  async getPublicQuestionsForExam(examId: string): Promise<PublicQuestion[]> {
    try {
      const questions = await this.questionService.getExamQuestions(examId);
      const codingIds = questions.filter((q) => q.type === QuestionType.CODING).map((q) => q.id);
      const coding = await this.codingContent.getPublicProblems(codingIds);
      // Build each object field by field so isCorrect and explanation can't leak.
      return questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        marks: q.marks,
        negativeMarks: q.negativeMarks ?? undefined,
        createdAt: q.createdAt.toISOString(),
        updatedAt: q.updatedAt.toISOString(),
        options: [...(q.options ?? [])]
          .sort((a, b) => a.order - b.order)
          .map((o) => ({ id: o.id, questionId: o.questionId, text: o.text, order: o.order })),
        // Student-safe by construction (samples only), see CodingContentService.
        ...(coding.has(q.id) ? { coding: coding.get(q.id) } : {}),
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Unknown types map to TEXT (needs a human) rather than SINGLE_CHOICE, so a
 * new question type can never be silently auto-scored as a 0-mark MCQ.
 */
function toAnswerFormat(type: QuestionType): QuestionAnswerFormat {
  switch (type) {
    case QuestionType.MCQ_MULTI:
      return 'MULTIPLE_CHOICE';
    case QuestionType.MCQ_SINGLE:
    case QuestionType.TRUE_FALSE:
      return 'SINGLE_CHOICE';
    case QuestionType.CODING:
      return 'CODE';
    default:
      return 'TEXT';
  }
}
