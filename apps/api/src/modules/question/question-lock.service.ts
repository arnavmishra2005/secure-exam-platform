/**
 * Owner: Person B.
 *
 * Protects exams once attempts can exist (ACTIVE or CLOSED):
 *  - their question list can't change (add / remove / reorder);
 *  - their questions stay editable through the question bank (decision log:
 *    professors may fix tests, marks and answer keys after an exam, then
 *    recalculate), except the type and the number of options, which student
 *    answers depend on. The legacy /questions endpoints keep refusing edits.
 *
 * DRAFT and SCHEDULED exams have no attempts yet, so they stay fully editable.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ExamStatus } from '@secure-exam/types';
import { ExamEntity } from '../exam/entities/exam.entity';
import { ExamQuestionEntity } from './entities/exam-question.entity';

export const LIVE_EXAM_STATUSES: readonly ExamStatus[] = [ExamStatus.ACTIVE, ExamStatus.CLOSED];

export interface QuestionUsage {
  usedInExams: number;
  locked: boolean;
}

@Injectable()
export class QuestionLockService {
  constructor(
    @InjectRepository(ExamQuestionEntity)
    private readonly examQuestionRepo: Repository<ExamQuestionEntity>,
    @InjectRepository(ExamEntity)
    private readonly examRepo: Repository<ExamEntity>,
  ) {}

  /** Usage per question id; ids not in any exam are absent from the map. */
  async usage(questionIds: string[]): Promise<Map<string, QuestionUsage>> {
    const result = new Map<string, QuestionUsage>();
    if (questionIds.length === 0) return result;

    const rows: Array<{ questionId: string; used: string; locked: boolean }> = await this.examQuestionRepo
      .createQueryBuilder('eq')
      .innerJoin(ExamEntity, 'e', 'e.id = eq.exam_id')
      .select('eq.question_id', 'questionId')
      .addSelect('COUNT(*)', 'used')
      .addSelect('BOOL_OR(e.status IN (:...live))', 'locked')
      .where('eq.question_id IN (:...ids)', { ids: questionIds })
      .setParameter('live', LIVE_EXAM_STATUSES)
      .groupBy('eq.question_id')
      .getRawMany();

    for (const r of rows) {
      result.set(r.questionId, { usedInExams: Number(r.used), locked: r.locked === true });
    }
    return result;
  }

  /** ACTIVE / CLOSED exams that use this question. */
  async liveExams(questionId: string): Promise<{ id: string; title: string; status: string }[]> {
    const exams = await this.examRepo
      .createQueryBuilder('e')
      .innerJoin(ExamQuestionEntity, 'eq', 'eq.exam_id = e.id')
      .where('eq.question_id = :questionId', { questionId })
      .andWhere('e.status IN (:...live)', { live: LIVE_EXAM_STATUSES })
      .orderBy('e.start_time', 'DESC')
      .getMany();
    return exams.map((e) => ({ id: e.id, title: e.title, status: e.status }));
  }

  async isLocked(questionId: string): Promise<boolean> {
    return (await this.usage([questionId])).get(questionId)?.locked ?? false;
  }

  async assertContentEditable(questionId: string): Promise<void> {
    if (await this.isLocked(questionId)) {
      throw new ConflictException(
        'This question is part of an exam that has started, so its content is locked. Duplicate it to make changes.',
      );
    }
  }

  /** Exam must exist and not be live. Returns it for convenience. */
  async assertExamComposable(examId: string): Promise<ExamEntity> {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException(`Exam ${examId} not found`);
    if (LIVE_EXAM_STATUSES.includes(exam.status)) {
      throw new ConflictException(`Questions can't be changed once the exam is ${exam.status}`);
    }
    return exam;
  }

  /** Exams (ids) among `examIds` that are live. */
  async liveExamIds(examIds: string[]): Promise<Set<string>> {
    if (examIds.length === 0) return new Set();
    const exams = await this.examRepo.find({
      where: { id: In(examIds), status: In([...LIVE_EXAM_STATUSES]) },
      select: ['id'],
    });
    return new Set(exams.map((e) => e.id));
  }
}
