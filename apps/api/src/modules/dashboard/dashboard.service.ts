/**
 * Owner: Person C (Time Extension, Dashboard)
 *
 * Read-only aggregator behind the student dashboard. A student only ever
 * sees exams they are registered for that have been published, and only
 * results an admin has published. Everything is keyed off the JWT sub.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StudentExamState } from '@secure-exam/types';
import type { DashboardResultItem, StudentDashboard, StudentExamView } from '@secure-exam/types';
import { In, Repository } from 'typeorm';
import { ResultEntity } from '../answer/entities/result.entity';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { RegistrationService } from '../course/registration.service';
import { ExamEntity } from '../exam/entities/exam.entity';
import { ExamService } from '../exam/exam.service';
import { NotificationService } from '../notification/notification.service';
import { ExamQuestionEntity } from '../question/entities/exam-question.entity';
import { UserService } from '../user/user.service';
import { classifyStudentExam } from './student-exam-state';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(AttemptEntity)
    private readonly attemptRepo: Repository<AttemptEntity>,
    @InjectRepository(ResultEntity)
    private readonly resultRepo: Repository<ResultEntity>,
    @InjectRepository(ExamQuestionEntity)
    private readonly examQuestionRepo: Repository<ExamQuestionEntity>,
    private readonly examService: ExamService,
    private readonly registrationService: RegistrationService,
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
  ) {}

  async getDashboard(userId: string): Promise<StudentDashboard> {
    const now = new Date();
    const [user, student, views, results, notifications] = await Promise.all([
      this.userService.findById(userId),
      this.userService.findStudentByUserId(userId),
      this.examViews(userId, now),
      this.publishedResults(userId),
      this.notificationService.listForUser(userId, 5),
    ]);

    const byStart = (a: StudentExamView, b: StudentExamView) => a.startTime.localeCompare(b.startTime);
    return {
      serverTime: now.toISOString(),
      student: {
        userId,
        studentId: student?.id ?? null,
        fullName: user.fullName,
        email: user.email,
        collegeId: student?.collegeId ?? null,
      },
      live: views.filter((v) => v.state === StudentExamState.LIVE).sort(byStart),
      upcoming: views.filter((v) => v.state === StudentExamState.UPCOMING).sort(byStart),
      completed: views
        .filter((v) => v.state === StudentExamState.COMPLETED || v.state === StudentExamState.MISSED)
        .sort((a, b) => byStart(b, a)),
      results,
      notifications: { unreadCount: notifications.unreadCount, latest: notifications.items },
    };
  }

  /** One exam, for the instructions screen. 404 unless registered and published. */
  async getExam(userId: string, examId: string): Promise<StudentExamView> {
    const view = (await this.examViews(userId, new Date(), examId))[0];
    if (!view) throw new NotFoundException('Exam not found');
    return view;
  }

  private async examViews(userId: string, now: Date, onlyExamId?: string): Promise<StudentExamView[]> {
    let examIds = await this.registrationService.examIdsForUser(userId);
    if (onlyExamId) examIds = examIds.filter((id) => id === onlyExamId);
    if (examIds.length === 0) return [];

    const exams = (await this.examService.findManyByIds(examIds)).filter((e) => e.publishedAt);
    if (exams.length === 0) return [];
    const ids = exams.map((e) => e.id);

    const [attempts, questionCounts] = await Promise.all([
      this.attemptRepo.find({ where: { examId: In(ids), studentId: userId } }),
      this.examQuestionRepo
        .createQueryBuilder('eq')
        .select('eq.examId', 'examId')
        .addSelect('COUNT(*)', 'count')
        .where('eq.examId IN (:...ids)', { ids })
        .groupBy('eq.examId')
        .getRawMany<{ examId: string; count: string }>(),
    ]);
    const attemptBy = new Map(attempts.map((a) => [a.examId, a]));
    const countBy = new Map(questionCounts.map((c) => [c.examId, Number(c.count)]));

    return exams.map((exam) => toStudentExamView(exam, attemptBy.get(exam.id) ?? null, countBy.get(exam.id) ?? 0, now));
  }

  private async publishedResults(userId: string): Promise<DashboardResultItem[]> {
    const results = await this.resultRepo.find({
      where: { studentId: userId, published: true },
      order: { publishedAt: 'DESC' },
    });
    if (results.length === 0) return [];
    const exams = await this.examService.findManyByIds([...new Set(results.map((r) => r.examId))]);
    const examBy = new Map(exams.map((e) => [e.id, e]));

    return results
      .filter((r) => examBy.has(r.examId))
      .map((r) => {
        const exam = examBy.get(r.examId)!;
        const percentage = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 10000) / 100 : 0;
        return {
          examId: r.examId,
          title: exam.title,
          attemptId: r.attemptId,
          score: Math.round(r.score * 100) / 100,
          maxScore: r.maxScore,
          percentage,
          passed: percentage >= exam.passPercentage,
          publishedAt: (r.publishedAt ?? r.updatedAt).toISOString(),
        };
      });
  }
}

function toStudentExamView(
  exam: ExamEntity,
  attempt: AttemptEntity | null,
  questionCount: number,
  now: Date,
): StudentExamView {
  return {
    examId: exam.id,
    title: exam.title,
    description: exam.description ?? null,
    durationMinutes: exam.durationMinutes,
    startTime: exam.startTime.toISOString(),
    endTime: exam.endTime.toISOString(),
    publishedAt: exam.publishedAt!.toISOString(),
    state: classifyStudentExam(exam, attempt?.status ?? null, now),
    attemptId: attempt?.id ?? null,
    attemptStatus: attempt?.status ?? null,
    expiresAt: attempt ? attempt.expiresAt.toISOString() : null,
    questionCount,
  };
}
