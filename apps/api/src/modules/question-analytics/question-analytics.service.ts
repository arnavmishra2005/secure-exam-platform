/**
 * Owner: Person B. Question-wise results for an exam (admin only):
 * the students × questions matrix with per-question stats, and a
 * per-attempt drill-down including submitted code and test results.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CodeLanguage,
  CodeSubmissionStatus,
  QuestionType,
  type AttemptDrilldown,
  type DrilldownCode,
  type DrilldownQuestion,
  type QuestionAnalyticsMatrix,
} from '@secure-exam/types';
import { CodeRunEntity } from '../coding/entities/code-run.entity';
import { CodeSubmissionEntity } from '../coding/entities/code-submission.entity';
import { CodingTestCaseEntity } from '../coding/entities/coding-test-case.entity';
import { ExamEntity } from '../exam/entities/exam.entity';
import { QuestionService } from '../question/question.service';
import { ExamAttemptDataAdapter } from './exam-attempt-data.adapter';
import { buildMatrix, type MatrixAttempt, type MatrixQuestion, type SubmittedKeys } from './matrix';

/** A matrix question that also carries option texts (for the drill-down). */
type ExamQuestion = Omit<MatrixQuestion, 'options'> & {
  options: { id: string; text: string; isCorrect: boolean }[];
};

@Injectable()
export class QuestionAnalyticsService {
  constructor(
    @InjectRepository(ExamEntity) private readonly examRepo: Repository<ExamEntity>,
    @InjectRepository(CodeSubmissionEntity) private readonly submissionRepo: Repository<CodeSubmissionEntity>,
    @InjectRepository(CodeRunEntity) private readonly runRepo: Repository<CodeRunEntity>,
    @InjectRepository(CodingTestCaseEntity) private readonly testCaseRepo: Repository<CodingTestCaseEntity>,
    private readonly questionService: QuestionService,
    private readonly attemptData: ExamAttemptDataAdapter,
  ) {}

  async matrix(examId: string): Promise<QuestionAnalyticsMatrix> {
    const exam = await this.exam(examId);
    const questions = await this.questions(examId);
    const attempts = await this.attemptData.attempts(examId);
    const result = await this.compute(questions, attempts);
    return { exam: { id: exam.id, title: exam.title, status: exam.status }, ...result };
  }

  async drilldown(examId: string, attemptId: string): Promise<AttemptDrilldown> {
    const exam = await this.exam(examId);
    const [attempt] = await this.attemptData.attempts(examId, attemptId);
    if (!attempt) throw new NotFoundException('Attempt not found for this exam');

    const questions = await this.questions(examId);
    const answers = await this.attemptData.answers([attemptId]);
    const { students, cells } = await this.compute(questions, [attempt], answers);
    const answerBy = new Map(answers.map((a) => [a.questionId, a]));

    const codingIds = questions.filter((q) => q.type === QuestionType.CODING).map((q) => q.id);
    const [subs, tests, runCounts] = await Promise.all([
      codingIds.length
        ? this.submissionRepo.find({
            where: { attemptId, questionId: In(codingIds) },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([]),
      codingIds.length
        ? this.testCaseRepo.find({ where: { questionId: In(codingIds) }, order: { order: 'ASC' } })
        : Promise.resolve([]),
      this.runCounts(attemptId),
    ]);

    const out: DrilldownQuestion[] = questions.map((q, i) => {
      const cell = cells.find((c) => c.questionId === q.id)!;
      const answer = answerBy.get(q.id);
      const base: DrilldownQuestion = {
        id: q.id,
        number: i + 1,
        text: q.text,
        type: q.type,
        marks: q.marks,
        state: cell.state,
        score: cell.score,
        markedForReview: cell.markedForReview,
        answeredAt: answer?.answeredAt?.toISOString() ?? null,
      };
      if (q.type === QuestionType.CODING) {
        const qSubs = subs.filter((s) => s.questionId === q.id);
        const qTests = tests.filter((t) => t.questionId === q.id);
        return { ...base, code: this.codeDetail(qSubs, qTests, answer?.textResponse ?? null, runCounts.get(q.id) ?? 0) };
      }
      const selected = new Set(answer?.selectedOptionIds ?? []);
      return {
        ...base,
        options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, selected: selected.has(o.id) })),
      };
    });

    return { exam: { id: exam.id, title: exam.title }, student: students[0], questions: out };
  }

  // ---------------------------------------------------------------------

  private async exam(examId: string): Promise<ExamEntity> {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException(`Exam ${examId} not found`);
    return exam;
  }

  private async questions(examId: string): Promise<ExamQuestion[]> {
    const entities = await this.questionService.getExamQuestions(examId);
    return entities.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      marks: q.marks,
      options: [...(q.options ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
    }));
  }

  private async compute(
    questions: MatrixQuestion[],
    attempts: MatrixAttempt[],
    preloadedAnswers?: Awaited<ReturnType<ExamAttemptDataAdapter['answers']>>,
  ) {
    const ids = attempts.map((a) => a.attemptId);
    const answers = preloadedAnswers ?? (await this.attemptData.answers(ids));
    const subs = ids.length
      ? await this.submissionRepo.find({
          where: { attemptId: In(ids) },
          select: ['attemptId', 'questionId', 'isFinal', 'fromDraft', 'status', 'score', 'passed', 'total', 'code'],
        })
      : [];
    // A final row that is PENDING is queued to run again: show it as not graded yet.
    const finals = subs
      .filter((s) => s.isFinal && s.status === CodeSubmissionStatus.GRADED)
      .map((s) => ({
        attemptId: s.attemptId,
        questionId: s.questionId,
        score: s.score,
        passed: s.passed,
        total: s.total,
        hasCode: s.code.trim().length > 0,
      }));
    const submitted: SubmittedKeys = new Set(
      subs
        .filter(
          (s) =>
            (s.isFinal && s.status === CodeSubmissionStatus.PENDING) ||
            (!s.isFinal &&
              !s.fromDraft &&
              (s.status === CodeSubmissionStatus.PENDING || s.status === CodeSubmissionStatus.GRADED)),
        )
        .map((s) => `${s.attemptId}|${s.questionId}`),
    );
    return buildMatrix(questions, attempts, answers, finals, submitted);
  }

  private async runCounts(attemptId: string): Promise<Map<string, number>> {
    const rows: Array<{ questionId: string; count: string }> = await this.runRepo
      .createQueryBuilder('r')
      .select('r.question_id', 'questionId')
      .addSelect('COUNT(*)', 'count')
      .where('r.attempt_id = :attemptId', { attemptId })
      .groupBy('r.question_id')
      .getRawMany();
    return new Map(rows.map((r) => [r.questionId, Number(r.count)]));
  }

  private codeDetail(
    subs: CodeSubmissionEntity[],
    tests: CodingTestCaseEntity[],
    draft: string | null,
    runCount: number,
  ): DrilldownCode | null {
    const submitCount = subs.filter((s) => !s.fromDraft).length;
    // A final row with no code is the 0 recorded when the student wrote nothing.
    const final = subs.find((s) => s.isFinal && s.code.trim().length > 0);
    if (!final) {
      // Not graded yet: show the latest Submit, else the autosaved draft.
      const lastSubmit = [...subs].reverse().find((s) => !s.isFinal && !s.fromDraft && s.code.trim());
      const code = lastSubmit?.code ?? draft;
      if (!code?.trim()) return null;
      return {
        code,
        language: lastSubmit?.language ?? CodeLanguage.PYTHON,
        source: lastSubmit ? 'SUBMITTED' : 'DRAFT',
        status: lastSubmit?.status ?? null,
        passed: 0,
        total: 0,
        tests: [],
        submitCount,
        runCount,
      };
    }
    if (final.status === CodeSubmissionStatus.PENDING) {
      // Queued to run again after the question was edited.
      return {
        code: final.code,
        language: final.language,
        source: final.fromDraft ? 'FINAL_DRAFT' : 'FINAL_SUBMIT',
        status: final.status,
        passed: 0,
        total: 0,
        tests: [],
        submitCount,
        runCount,
      };
    }
    const byId = new Map(tests.map((t, i) => [t.id, { test: t, index: i + 1 }]));
    return {
      code: final.code,
      language: final.language,
      source: final.fromDraft ? 'FINAL_DRAFT' : 'FINAL_SUBMIT',
      status: final.status,
      passed: final.passed,
      total: final.total,
      tests: final.resultsJson.map((r, i) => {
        const t = byId.get(r.testCaseId);
        return {
          index: t?.index ?? i + 1,
          isSample: t?.test.isSample ?? false,
          verdict: r.verdict,
          weight: r.weight,
          timeMs: r.timeMs,
          input: t?.test.input ?? '',
          expectedOutput: t?.test.expectedOutput ?? '',
          stdout: r.stdout,
          stderr: r.stderr,
        };
      }),
      submitCount,
      runCount,
    };
  }
}
