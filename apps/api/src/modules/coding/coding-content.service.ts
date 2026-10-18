/**
 * Owner: Person B.
 *
 * Read side of coding problems that other modules may depend on. Lives in
 * its own module (CodingContentModule) with no dependencies on attempt or
 * answer code, so the answer module can import it without a cycle.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PublicCodingProblem } from '@secure-exam/types';
import { CodingProblemEntity } from './entities/coding-problem.entity';
import { CodingTestCaseEntity } from './entities/coding-test-case.entity';

@Injectable()
export class CodingContentService {
  constructor(
    @InjectRepository(CodingProblemEntity)
    private readonly problemRepo: Repository<CodingProblemEntity>,
    @InjectRepository(CodingTestCaseEntity)
    private readonly testCaseRepo: Repository<CodingTestCaseEntity>,
  ) {}

  /**
   * Student-safe problems by question id. Built field by field so the
   * reference solution and hidden tests can't leak. Questions without a
   * problem row are left out of the map.
   */
  async getPublicProblems(questionIds: string[]): Promise<Map<string, PublicCodingProblem>> {
    const result = new Map<string, PublicCodingProblem>();
    if (questionIds.length === 0) return result;

    const [problems, samples] = await Promise.all([
      this.problemRepo.find({ where: { questionId: In(questionIds) } }),
      this.testCaseRepo.find({
        where: { questionId: In(questionIds), isSample: true },
        order: { order: 'ASC' },
      }),
    ]);

    for (const p of problems) {
      result.set(p.questionId, {
        statementMd: p.statementMd,
        starterCode: { ...p.starterCode },
        allowedLanguages: [...p.allowedLanguages],
        timeLimitMs: p.timeLimitMs,
        memoryLimitMb: p.memoryLimitMb,
        comparisonMode: p.comparisonMode,
        samples: samples
          .filter((t) => t.questionId === p.questionId)
          .map((t, i) => ({ index: i + 1, input: t.input, expectedOutput: t.expectedOutput })),
      });
    }
    return result;
  }
}
