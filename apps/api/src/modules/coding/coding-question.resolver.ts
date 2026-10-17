/**
 * Owner: Person B.
 *
 * Finds the coding problem behind a question in an exam, with the same
 * checks for run, submit and grading.
 */

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionType } from '@secure-exam/types';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { QuestionEntity } from '../question/entities/question.entity';
import { CodingProblemEntity } from './entities/coding-problem.entity';
import { CodingTestCaseEntity } from './entities/coding-test-case.entity';

export interface ResolvedCodingQuestion {
  question: QuestionEntity;
  problem: CodingProblemEntity;
}

@Injectable()
export class CodingQuestionResolver {
  constructor(
    @InjectRepository(ExamQuestionEntity)
    private readonly examQuestionRepo: Repository<ExamQuestionEntity>,
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(CodingProblemEntity)
    private readonly problemRepo: Repository<CodingProblemEntity>,
    @InjectRepository(CodingTestCaseEntity)
    private readonly testCaseRepo: Repository<CodingTestCaseEntity>,
  ) {}

  /**
   * The CODING question and its problem, only if the question is part of
   * the exam. Same 400 wording as saving an answer to a foreign question.
   */
  async resolveInExam(examId: string, questionId: string): Promise<ResolvedCodingQuestion> {
    const inExam = await this.examQuestionRepo.exist({ where: { examId, questionId } });
    if (!inExam) {
      throw new BadRequestException("This question does not belong to the attempt's exam");
    }
    const question = await this.questionRepo.findOne({ where: { id: questionId } });
    if (!question || question.type !== QuestionType.CODING) {
      throw new BadRequestException('This is not a coding question');
    }
    const problem = await this.problemRepo.findOne({ where: { questionId } });
    if (!problem) {
      throw new ConflictException('This coding question has not been set up yet');
    }
    return { question, problem };
  }

  /** All test cases (samples first by `order`, then hidden), as graded at submit. */
  allTests(questionId: string): Promise<CodingTestCaseEntity[]> {
    return this.testCaseRepo.find({ where: { questionId }, order: { order: 'ASC' } });
  }

  sampleTests(questionId: string): Promise<CodingTestCaseEntity[]> {
    return this.testCaseRepo.find({ where: { questionId, isSample: true }, order: { order: 'ASC' } });
  }
}
