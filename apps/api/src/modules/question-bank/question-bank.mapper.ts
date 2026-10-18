/**
 * Owner: Person B. Entity → admin response shapes for the question bank.
 * Admin-only: these include answer keys, hidden tests and reference solutions.
 */

import { BankQuestionDetail, BankQuestionSummary, Topic } from '@secure-exam/types';
import { CodingProblemEntity } from '../coding/entities/coding-problem.entity';
import { CodingTestCaseEntity } from '../coding/entities/coding-test-case.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { TopicEntity } from '../question/entities/topic.entity';
import type { QuestionUsage } from '../question/question-lock.service';

/** Lowercase, trim, collapse inner whitespace, drop empties and duplicates. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 50);
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export function toTopic(t: TopicEntity): Topic {
  return { id: t.id, courseId: t.courseId, name: t.name };
}

export function toSummary(
  q: QuestionEntity,
  tags: string[],
  usage: QuestionUsage | undefined,
): BankQuestionSummary {
  return {
    id: q.id,
    text: q.text,
    type: q.type,
    marks: q.marks,
    courseId: q.courseId ?? null,
    topicId: q.topicId ?? null,
    topicName: q.topic?.name ?? null,
    difficulty: q.difficulty ?? null,
    status: q.status,
    tags: [...tags].sort(),
    usedInExams: usage?.usedInExams ?? 0,
    locked: usage?.locked ?? false,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

export function toDetail(
  q: QuestionEntity,
  tags: string[],
  usage: QuestionUsage | undefined,
  problem: CodingProblemEntity | null,
  tests: CodingTestCaseEntity[],
  liveExams: BankQuestionDetail['liveExams'] = [],
): BankQuestionDetail {
  return {
    ...toSummary(q, tags, usage),
    negativeMarks: q.negativeMarks ?? null,
    explanation: q.explanation ?? null,
    options: [...(q.options ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((o) => ({ id: o.id, questionId: o.questionId, text: o.text, isCorrect: o.isCorrect, order: o.order })),
    coding: problem
      ? {
          statementMd: problem.statementMd,
          starterCode: problem.starterCode,
          allowedLanguages: problem.allowedLanguages,
          timeLimitMs: problem.timeLimitMs,
          memoryLimitMb: problem.memoryLimitMb,
          comparisonMode: problem.comparisonMode,
          referenceSolution: problem.referenceSolution,
          tests: tests.map((t) => ({
            id: t.id,
            input: t.input,
            expectedOutput: t.expectedOutput,
            isSample: t.isSample,
            weight: t.weight,
            order: t.order,
          })),
        }
      : null,
    liveExams,
  };
}
