import { Injectable } from '@nestjs/common';
import { IQuestionLookupService, QuestionLookupInfo } from './question-lookup.interface';

/**
 * Development/test stand-in for Person B's Question module. Returns a
 * small fixed fixture set (valid v4-format UUIDs, so they pass the same
 * @IsUUID validation the real questions/options would) covering all three
 * answerFormat values, so both scoring logic AND the answer-shape
 * validation in answer.service.ts (objective vs subjective, single- vs
 * multi-select, option-must-belong-to-question) can be exercised end to
 * end before B's real Question entities exist.
 *
 * - QUESTION_1: SINGLE_CHOICE, 2 options, option A correct.
 * - QUESTION_2: MULTIPLE_CHOICE, 3 options, A and C correct (exact-set
 *   match required for credit — no partial credit for multi-select).
 * - QUESTION_3: TEXT (subjective) — never auto-graded.
 */
export const FIXTURE_QUESTION_1_ID = '11111111-1111-4111-8111-111111111111';
export const FIXTURE_QUESTION_1_OPTION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const FIXTURE_QUESTION_1_OPTION_B = 'aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb';

export const FIXTURE_QUESTION_2_ID = '22222222-2222-4222-8222-222222222222';
export const FIXTURE_QUESTION_2_OPTION_A = 'bbbbbbbb-bbbb-4bbb-8bbb-aaaaaaaaaaaa';
export const FIXTURE_QUESTION_2_OPTION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const FIXTURE_QUESTION_2_OPTION_C = 'bbbbbbbb-bbbb-4bbb-8bbb-cccccccccccc';

export const FIXTURE_QUESTION_3_ID = '33333333-3333-4333-8333-333333333333';

/** An option ID that doesn't belong to any fixture question — for validation tests. */
export const FIXTURE_FOREIGN_OPTION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const FIXTURE_QUESTIONS: QuestionLookupInfo[] = [
  {
    id: FIXTURE_QUESTION_1_ID,
    marks: 1,
    answerFormat: 'SINGLE_CHOICE',
    optionIds: [FIXTURE_QUESTION_1_OPTION_A, FIXTURE_QUESTION_1_OPTION_B],
    correctOptionIds: [FIXTURE_QUESTION_1_OPTION_A],
  },
  {
    id: FIXTURE_QUESTION_2_ID,
    marks: 2,
    answerFormat: 'MULTIPLE_CHOICE',
    optionIds: [FIXTURE_QUESTION_2_OPTION_A, FIXTURE_QUESTION_2_OPTION_B, FIXTURE_QUESTION_2_OPTION_C],
    correctOptionIds: [FIXTURE_QUESTION_2_OPTION_A, FIXTURE_QUESTION_2_OPTION_C],
  },
  {
    id: FIXTURE_QUESTION_3_ID,
    marks: 2,
    answerFormat: 'TEXT',
  },
];

@Injectable()
export class MockQuestionLookupService implements IQuestionLookupService {
  async getQuestionsForExam(_examId: string): Promise<QuestionLookupInfo[]> {
    return FIXTURE_QUESTIONS;
  }
}

/**
 * INTEGRATION: once Person B's real Question module is ready, replace the
 * provider binding in answer.module.ts:
 *
 *   { provide: QUESTION_LOOKUP_SERVICE, useClass: MockQuestionLookupService }
 *
 * with an adapter implementing IQuestionLookupService against B's real
 * QuestionService, mapping B's QuestionType enum to 'SINGLE_CHOICE' |
 * 'MULTIPLE_CHOICE' | 'TEXT' and B's Option entities to `optionIds` /
 * `correctOptionIds` (the subset flagged `isCorrect`). No other file in
 * the answer module needs to change.
 */
