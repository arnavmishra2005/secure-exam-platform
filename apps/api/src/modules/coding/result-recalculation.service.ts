/**
 * Owner: Person B.
 *
 * "Recalculate results" after a professor edits questions used in a
 * started exam (marks, correct options, coding tests…). For every finished
 * attempt in scope:
 *  - coding answers whose tests are unchanged are rescaled from their stored
 *    per-test verdicts to the current marks (no rerun);
 *  - coding answers whose tests changed are queued to run again
 *    (CodeGradingService picks them up);
 *  - attempts with nothing queued get their total recomputed now; the others
 *    when their last rerun finishes.
 * Totals are recomputed from scratch, so this replaces manual score overrides.
 * Attempts not graded yet are left alone: they'll be graded with the current
 * questions anyway.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuditEventType, CodeSubmissionStatus, QuestionType, type RecalculateResponse } from '@secure-exam/types';
import { AuditService } from '../audit/audit.service';
import { ExamEntity } from '../exam/entities/exam.entity';
import { ATTEMPT_ACCESS, IAttemptAccess } from './attempt-access/attempt-access.interface';
import { CodingQuestionResolver } from './coding-question.resolver';
import { CodeSubmissionEntity } from './entities/code-submission.entity';
import { scoreTests } from './grading/scoring';
import { ResultTotalsService } from './result-totals.service';

@Injectable()
export class ResultRecalculationService {
  constructor(
    @Inject(ATTEMPT_ACCESS) private readonly attempts: IAttemptAccess,
    @InjectRepository(ExamEntity) private readonly examRepo: Repository<ExamEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly resolver: CodingQuestionResolver,
    private readonly totals: ResultTotalsService,
    private readonly auditService: AuditService,
  ) {}

  async recalculate(examId: string, questionId: string | undefined, actorId: string): Promise<RecalculateResponse> {
    if (!(await this.examRepo.exist({ where: { id: examId } }))) {
      throw new NotFoundException(`Exam ${examId} not found`);
    }
    const questions = await this.totals.examQuestions(examId);
    if (questionId && !questions.some((q) => q.id === questionId)) {
      throw new NotFoundException('That question is not part of this exam');
    }
    const finished = await this.attempts.listFinishedAttempts(examId);
    const attemptIds = finished.map((a) => a.attemptId);

    const codingInScope = questions.filter(
      (q) => q.type === QuestionType.CODING && (!questionId || q.id === questionId),
    );
    const testsByQuestion = new Map(
      await Promise.all(codingInScope.map(async (q) => [q.id, await this.resolver.allTests(q.id)] as const)),
    );

    const queuedAttempts = new Set<string>();
    let queuedToRerun = 0;
    let recalculatedNow = 0;

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CodeSubmissionEntity);
      if (attemptIds.length && codingInScope.length) {
        const finals = await repo.find({
          where: { attemptId: In(attemptIds), questionId: In(codingInScope.map((q) => q.id)), isFinal: true },
        });
        for (const f of finals) {
          const q = codingInScope.find((x) => x.id === f.questionId)!;
          const tests = testsByQuestion.get(q.id) ?? [];
          if (!f.code.trim()) {
            await repo.update({ id: f.id }, { maxScore: q.marks, score: 0 });
          } else if (f.status === CodeSubmissionStatus.GRADED && sameTests(f, tests.map((t) => t.id))) {
            const weightById = new Map(tests.map((t) => [t.id, t.weight]));
            const rescaled = scoreTests(
              q.marks,
              f.resultsJson.map((r) => ({ verdict: r.verdict, weight: weightById.get(r.testCaseId) ?? r.weight })),
            );
            await repo.update({ id: f.id }, { score: rescaled.score, maxScore: q.marks });
          } else {
            await repo.update({ id: f.id }, { status: CodeSubmissionStatus.PENDING });
            queuedAttempts.add(f.attemptId);
            queuedToRerun++;
          }
        }
      }
      for (const a of finished) {
        const stillQueued = await repo.count({
          where: { attemptId: a.attemptId, isFinal: true, status: CodeSubmissionStatus.PENDING },
        });
        if (stillQueued === 0) {
          await this.totals.recompute(manager, examId, a.attemptId, questions);
          recalculatedNow++;
        } else {
          queuedAttempts.add(a.attemptId);
        }
      }
    });

    await this.auditService.logEvent(
      AuditEventType.RESULTS_RECALCULATED,
      { examId, questionId: questionId ?? null, attempts: finished.length, recalculatedNow, queuedToRerun },
      actorId,
    );
    return { attempts: finished.length, recalculatedNow, queuedToRerun };
  }
}

/** The stored results were produced by exactly the current set of tests. */
function sameTests(final: CodeSubmissionEntity, currentTestIds: string[]): boolean {
  const stored = final.resultsJson.map((r) => r.testCaseId).sort();
  const current = [...currentTestIds].sort();
  return stored.length > 0 && stored.length === current.length && stored.every((id, i) => id === current[i]);
}
