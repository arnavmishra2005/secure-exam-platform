import { Injectable } from '@nestjs/common';
import { QuestionService } from '../../question/question.service';
import { IQuestionLookupService, QuestionLookupInfo } from './question-lookup.interface';
import { QuestionType } from '@secure-exam/types';
import type { PublicQuestion } from '@secure-exam/types';

@Injectable()
export class QuestionLookupAdapter implements IQuestionLookupService {
  constructor(private readonly questionService: QuestionService) {}

  async getQuestionsForExam(examId: string): Promise<QuestionLookupInfo[]> {
    try {
      const questions = await this.questionService.getExamQuestions(examId);
      return questions.map((q) => {
        let answerFormat: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT' = 'SINGLE_CHOICE';
        if (q.type === QuestionType.MCQ_MULTI) {
          answerFormat = 'MULTIPLE_CHOICE';
        } else if (q.type === QuestionType.MCQ_SINGLE || q.type === QuestionType.TRUE_FALSE) {
          answerFormat = 'SINGLE_CHOICE';
        }

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
      }));
    } catch {
      return [];
    }
  }
}
