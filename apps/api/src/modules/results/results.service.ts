// Owner: Person A (Platform, Courses, Publish, Results)
// Exam-level results analytics. Data contract: docs/analytics-data-contract.md.

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AttemptStatus, AuditEventType, NotificationType, StudentAttemptStatus } from '@secure-exam/types';
import type {
  ExamResultsOverview,
  ExamResultsSummary,
  ExamStudentResults,
  PublishResultsResponse,
  StudentResultRow,
} from '@secure-exam/types';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ClientSecurityService } from '../client-security/client-security.service';
import { ResultEntity } from '../answer/entities/result.entity';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { RegistrationService } from '../course/registration.service';
import { ExamEntity } from '../exam/entities/exam.entity';
import { ExamService } from '../exam/exam.service';
import { NotificationService } from '../notification/notification.service';
import { QuestionService } from '../question/question.service';
import { StudentEntity } from '../user/entities/student.entity';
import { UserService } from '../user/user.service';
import { McqGradingService } from './mcq-grading.service';
import {
  mean,
  median,
  percentage,
  percentageHistogram,
  rankByScore,
  round2,
  standardDeviation,
} from './results-stats';

const FINALIZED: ReadonlySet<AttemptStatus> = new Set([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]);

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    @InjectRepository(ExamEntity)
    private readonly examRepo: Repository<ExamEntity>,
    @InjectRepository(AttemptEntity)
    private readonly attemptRepo: Repository<AttemptEntity>,
    @InjectRepository(ResultEntity)
    private readonly resultRepo: Repository<ResultEntity>,
    private readonly examService: ExamService,
    private readonly questionService: QuestionService,
    private readonly registrationService: RegistrationService,
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
    private readonly mcqGrading: McqGradingService,
    private readonly auditService: AuditService,
    private readonly clientSecurity: ClientSecurityService,
  ) {}

  /** Exam picker on the results page: every exam, newest first, with headline numbers. */
  async listExams(): Promise<ExamResultsSummary[]> {
    const exams = await this.examRepo.find({ order: { startTime: 'DESC' } });
    if (exams.length === 0) return [];

    const registered = await this.registrationService.countsByExam(exams.map((e) => e.id));
    const aggregates: { examId: string; submitted: string; avgPct: string | null; passRate: string | null }[] =
      await this.resultRepo.query(
        `SELECT r."examId" AS "examId",
                COUNT(*) AS submitted,
                AVG(CASE WHEN r."maxScore" > 0 THEN r.score * 100.0 / r."maxScore" ELSE 0 END) AS "avgPct",
                AVG(CASE WHEN r."maxScore" > 0 AND r.score * 100.0 / r."maxScore" >= e.pass_percentage
                         THEN 100.0 ELSE 0 END) AS "passRate"
           FROM results r
           JOIN exams e ON e.id = r."examId"
          GROUP BY r."examId"`,
      );
    const aggBy = new Map(aggregates.map((a) => [a.examId, a]));

    return exams.map((exam) => {
      const agg = aggBy.get(exam.id);
      return {
        examId: exam.id,
        title: exam.title,
        status: exam.status,
        startTime: exam.startTime.toISOString(),
        endTime: exam.endTime.toISOString(),
        publishedAt: exam.publishedAt ? exam.publishedAt.toISOString() : null,
        registeredCount: registered.get(exam.id) ?? 0,
        submittedCount: agg ? Number(agg.submitted) : 0,
        averagePercentage: agg?.avgPct != null ? round2(Number(agg.avgPct)) : null,
        passRate: agg?.passRate != null ? round2(Number(agg.passRate)) : null,
      };
    });
  }

  async overview(examId: string): Promise<ExamResultsOverview> {
    const data = await this.loadExamData(examId);
    const { exam, maxScore, attempts, resultByAttempt, registeredUserIds } = data;

    const finalized = attempts.filter((a) => FINALIZED.has(a.status) && resultByAttempt.has(a.id));
    const scores = finalized.map((a) => resultByAttempt.get(a.id)!.score);
    const percentages = finalized.map((a) => {
      const r = resultByAttempt.get(a.id)!;
      return percentage(r.score, r.maxScore || maxScore);
    });
    const passedCount = percentages.filter((p) => p >= exam.passPercentage).length;
    const durations = finalized
      .filter((a) => a.submittedAt)
      .map((a) => (a.submittedAt!.getTime() - a.startedAt.getTime()) / 1000);

    const attemptedUserIds = new Set(attempts.map((a) => a.studentId));
    const roundOrNull = (v: number | null) => (v === null ? null : round2(v));

    return {
      examId,
      title: exam.title,
      maxScore,
      passPercentage: exam.passPercentage,
      registeredCount: registeredUserIds.size,
      startedCount: attempts.length,
      submittedCount: finalized.length,
      inProgressCount: attempts.filter((a) => a.status === AttemptStatus.IN_PROGRESS).length,
      absentCount: [...registeredUserIds].filter((id) => !attemptedUserIds.has(id)).length,
      mean: roundOrNull(mean(scores)),
      median: roundOrNull(median(scores)),
      min: scores.length ? round2(Math.min(...scores)) : null,
      max: scores.length ? round2(Math.max(...scores)) : null,
      standardDeviation: roundOrNull(standardDeviation(scores)),
      passRate: percentages.length ? round2((passedCount / percentages.length) * 100) : null,
      passedCount,
      histogram: percentageHistogram(percentages),
      averageTimeSeconds: durations.length ? Math.round(mean(durations)!) : null,
      needsManualReviewCount: finalized.filter((a) => resultByAttempt.get(a.id)!.needsManualReview).length,
    };
  }

  /** Student-wise table: every registered student plus anyone else who attempted. */
  async students(examId: string): Promise<ExamStudentResults> {
    const { exam, maxScore, attempts, resultByAttempt, registeredStudents } = await this.loadExamData(examId);

    const studentByUser = new Map<string, StudentEntity>(registeredStudents.map((s) => [s.userId, s]));
    const missing = attempts.map((a) => a.studentId).filter((id) => !studentByUser.has(id));
    for (const student of await this.userService.findStudentsByUserIds([...new Set(missing)])) {
      studentByUser.set(student.userId, student);
    }
    const attemptByUser = new Map(attempts.map((a) => [a.studentId, a]));
    const violationCounts = await this.clientSecurity.countByAttempt(attempts.map((a) => a.id));
    const userIds = new Set([...studentByUser.keys(), ...attemptByUser.keys()]);

    const rows: StudentResultRow[] = [...userIds].map((userId) => {
      const student = studentByUser.get(userId);
      const attempt = attemptByUser.get(userId);
      const result = attempt ? resultByAttempt.get(attempt.id) : undefined;
      const rowMax = result?.maxScore || maxScore;
      const pct = result ? round2(percentage(result.score, rowMax)) : null;
      const timeTaken =
        attempt?.submittedAt && FINALIZED.has(attempt.status)
          ? Math.round((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000)
          : null;

      return {
        rank: null,
        studentId: student?.id ?? null,
        userId,
        collegeId: student?.collegeId ?? null,
        fullName: student?.user?.fullName ?? 'Unknown user',
        email: student?.user?.email ?? '',
        status: attempt ? (attempt.status as unknown as StudentAttemptStatus) : StudentAttemptStatus.NOT_STARTED,
        attemptId: attempt?.id ?? null,
        score: result ? round2(result.score) : null,
        maxScore: rowMax,
        percentage: pct,
        passed: pct === null ? null : pct >= exam.passPercentage,
        timeTakenSeconds: timeTaken,
        startedAt: attempt ? attempt.startedAt.toISOString() : null,
        submittedAt: attempt?.submittedAt ? attempt.submittedAt.toISOString() : null,
        resultPublished: result?.published ?? false,
        needsManualReview: result?.needsManualReview ?? false,
        violationCount: violationCounts.get(attempt?.id ?? '') ?? (attempt ? 0 : null),
      };
    });

    const graded = rows.filter((r) => r.score !== null && FINALIZED.has(r.status as unknown as AttemptStatus));
    const ranked = rankByScore(graded.map((r) => ({ ...r, score: r.score! })));
    const rankBy = new Map(ranked.map((r) => [r.userId, r.rank]));
    const statusOrder: Record<StudentAttemptStatus, number> = {
      [StudentAttemptStatus.SUBMITTED]: 0,
      [StudentAttemptStatus.AUTO_SUBMITTED]: 0,
      [StudentAttemptStatus.IN_PROGRESS]: 1,
      [StudentAttemptStatus.NOT_STARTED]: 2,
    };

    const items = rows
      .map((r) => ({ ...r, rank: rankBy.get(r.userId) ?? null }))
      .sort(
        (a, b) =>
          (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
          statusOrder[a.status] - statusOrder[b.status] ||
          (a.collegeId ?? '').localeCompare(b.collegeId ?? ''),
      );

    return { examId, maxScore, passPercentage: exam.passPercentage, items };
  }

  /** Publishes every unpublished result of the exam and notifies those students. */
  async publishResults(examId: string, actorId: string): Promise<PublishResultsResponse> {
    const exam = await this.examService.findOne(examId);
    const publishedAt = new Date();
    const updated = await this.resultRepo
      .createQueryBuilder()
      .update(ResultEntity)
      .set({ published: true, publishedAt })
      .where('"examId" = :examId AND published = false', { examId })
      .returning(['studentId'])
      .execute();
    const userIds = ((updated.raw as { studentId: string }[]) ?? []).map((r) => r.studentId);

    if (userIds.length > 0) {
      await this.notificationService.notifyMany(userIds, {
        type: NotificationType.RESULT_PUBLISHED,
        title: `Result available: ${exam.title}`,
        body: `Your result for "${exam.title}" has been published.`,
        data: { examId },
      });
    }
    await this.auditService.logEvent(AuditEventType.RESULT_PUBLISHED, { examId, publishedCount: userIds.length }, actorId);
    return { publishedCount: userIds.length };
  }

  /** Re-runs MCQ grading for every finalized attempt (e.g. after an answer-key fix). */
  async recompute(examId: string, actorId: string): Promise<{ attemptsGraded: number; failed: number }> {
    await this.examService.findOne(examId);
    const attempts = await this.attemptRepo.find({
      where: { examId, status: In([...FINALIZED]) },
      select: ['id'],
    });
    let attemptsGraded = 0;
    let failed = 0;
    for (const attempt of attempts) {
      try {
        await this.mcqGrading.gradeAttempt(attempt.id);
        attemptsGraded++;
      } catch (err) {
        failed++;
        this.logger.error(`Recompute failed for attempt ${attempt.id}`, err instanceof Error ? err.stack : undefined);
      }
    }
    await this.auditService.logEvent(AuditEventType.RESULTS_RECOMPUTED, { examId, attemptsGraded, failed }, actorId);
    return { attemptsGraded, failed };
  }

  private async loadExamData(examId: string) {
    const exam = await this.examService.findOne(examId);
    const [questions, attempts, results, registrations] = await Promise.all([
      this.questionService.getExamQuestions(examId),
      this.attemptRepo.find({ where: { examId } }),
      this.resultRepo.find({ where: { examId } }),
      this.registrationService.listForExam(examId),
    ]);
    const questionMax = questions.reduce((sum, q) => sum + q.marks, 0);
    const maxScore = questionMax || Math.max(0, ...results.map((r) => r.maxScore));

    const registeredStudents = await this.userService.findStudentsByIds(registrations.map((r) => r.studentId));
    return {
      exam,
      maxScore,
      attempts,
      resultByAttempt: new Map(results.map((r) => [r.attemptId, r])),
      registeredStudents,
      registeredUserIds: new Set(registeredStudents.map((s) => s.userId)),
    };
  }
}
