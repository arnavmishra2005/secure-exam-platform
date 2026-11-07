import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { AttemptStatus, CodeSubmissionStatus, QuestionState, QuestionType, TestCaseVerdict, decodeCodeDraft } from '@secure-exam/types';
import type { StudentQuestionReview, StudentSubmissionReview } from '@secure-exam/types';
import { AttemptEntity } from '../attempt/entities/attempt.entity';
import { AnswerEntity } from '../answer/entities/answer.entity';
import { ResultEntity } from '../answer/entities/result.entity';
import { ExamEntity } from '../exam/entities/exam.entity';
import { QuestionScoreEntity } from '../results/entities/question-score.entity';
import { CodeSubmissionEntity } from '../coding/entities/code-submission.entity';
import { CodingTestCaseEntity } from '../coding/entities/coding-test-case.entity';
import { CodingContentService } from '../coding/coding-content.service';
import { QuestionService } from '../question/question.service';

@Injectable()
export class StudentSubmissionService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    private readonly questions: QuestionService, private readonly coding: CodingContentService) {}

  async get(userId: string, examId: string): Promise<StudentSubmissionReview> {
    const attempt = await this.db.getRepository(AttemptEntity).findOne({
      where: { examId, studentId: userId, status: In([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]) },
    });
    if (!attempt?.submittedAt) throw new NotFoundException('Submitted exam not found');
    const exam = await this.db.getRepository(ExamEntity).findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');
    const [questions, answers, result, submissions] = await Promise.all([
      this.questions.getExamQuestions(examId),
      this.db.getRepository(AnswerEntity).find({ where: { attemptId: attempt.id } }),
      this.db.getRepository(ResultEntity).findOne({ where: { attemptId: attempt.id } }),
      this.db.getRepository(CodeSubmissionEntity).find({ where: { attemptId: attempt.id }, order: { createdAt: 'DESC', id: 'DESC' } }),
    ]);
    const codingIds = questions.filter(q => q.type === QuestionType.CODING).map(q => q.id);
    const problems = await this.coding.getPublicProblems(codingIds);
    // Do not even load score/test details until the publication gate passes.
    const published = result?.published === true;
    const scores = published ? await this.db.getRepository(QuestionScoreEntity).find({ where: { attemptId: attempt.id } }) : [];
    const tests = published && codingIds.length ? await this.db.getRepository(CodingTestCaseEntity).find({ where: { questionId: In(codingIds) }, order: { order: 'ASC' } }) : [];
    const rows: StudentQuestionReview[] = questions.map(q => {
      const answer = answers.find(a => a.questionId === q.id);
      const row: StudentQuestionReview = {
        question: {
          id: q.id, text: q.text, type: q.type, marks: q.marks,
          negativeMarks: q.negativeMarks ?? undefined,
          createdAt: q.createdAt.toISOString(), updatedAt: q.updatedAt.toISOString(),
          options: [...(q.options ?? [])].sort((a,b) => a.order-b.order).map(o => ({ id: o.id, questionId: o.questionId, text: o.text, order: o.order })),
          ...(problems.has(q.id) ? { coding: problems.get(q.id) } : {}),
        },
        selectedOptionIds: answer?.selectedOptionIds ?? [], textResponse: answer?.textResponse ?? null,
        markedForReview: answer?.markedForReview ?? [QuestionState.MARKED_REVIEW, QuestionState.ANSWERED_AND_MARKED_REVIEW].includes(answer?.state as QuestionState),
      };
      const code = submissions.find(s => s.questionId === q.id && s.isFinal) ?? submissions.find(s =>
        s.questionId === q.id && !s.fromDraft && s.createdAt <= attempt.submittedAt! &&
        [CodeSubmissionStatus.PENDING, CodeSubmissionStatus.GRADED].includes(s.status));
      if (code) row.code = { code: code.code, language: code.language, submittedAt: code.fromDraft ? null : code.createdAt.toISOString(), fromDraft: code.fromDraft };
      if (!published) return row;
      const score = scores.find(s => s.questionId === q.id);
      // Optional fields are Person B's #13 contract; no dependency on its migration.
      const adjustment = score as (QuestionScoreEntity & { autoScore?: number; manualAdjustment?: number; adjustReason?: string }) | undefined;
      row.analysis = {
        score: score?.score ?? null, maxScore: score?.maxScore ?? q.marks,
        gradingPending: q.type === QuestionType.CODING ? !code?.isFinal || code.status === CodeSubmissionStatus.PENDING : !score,
        reason: !score ? 'Grading in progress' : score.isCorrect === false ? 'Wrong option chosen' : row.selectedOptionIds.length ? 'Correct answer' : 'No answer submitted',
        ...(adjustment?.autoScore !== undefined ? { autoScore: adjustment.autoScore } : {}),
        ...(adjustment?.manualAdjustment !== undefined ? { manualAdjustment: adjustment.manualAdjustment, adjustReason: adjustment.adjustReason } : {}),
      };
      if (q.type !== QuestionType.CODING) {
        row.analysis.correctOptionIds = (q.options ?? []).filter(o => o.isCorrect).map(o => o.id);
        row.analysis.explanation = q.explanation ?? null;
      } else {
        const questionTests = tests.filter(t => t.questionId === q.id);
        const resultBy = new Map((code?.resultsJson ?? []).map(r => [r.testCaseId, r]));
        row.analysis.passed = code?.passed ?? 0;
        row.analysis.total = code?.total || questionTests.length;
        // Every test case of the question, hidden ones included, so the owning student can learn from them
        // once results are published, also when no code ran (then only input and expected output are known).
        row.analysis.tests = questionTests.map((test, index) => {
          const r = resultBy.get(test.id);
          const errorKind = (r as { errorKind?: string } | undefined)?.errorKind;
          return { index: index + 1, isSample: test.isSample, verdict: r?.verdict ?? null, timeMs: r?.timeMs ?? null,
            ...(errorKind ? { errorKind } : {}),
            input: test.input, expectedOutput: test.expectedOutput,
            ...(r ? { stdout: r.stdout, stderr: r.stderr } : {}),
          };
        });
        const failed = (code?.resultsJson ?? []).filter(r => r.verdict !== TestCaseVerdict.PASSED);
        const counts = new Map<string, number>();
        failed.forEach(r => counts.set(r.verdict, (counts.get(r.verdict) ?? 0) + 1));
        const wroteDraft = decodeCodeDraft(answer?.textResponse).code.trim().length > 0;
        row.analysis.reason = row.analysis.gradingPending ? 'Grading in progress'
          : !code?.code.trim()
            ? wroteDraft && !exam.gradeUnsubmittedCode
              ? 'Code was not submitted; saved drafts do not receive marks for this exam'
              : 'No code was written, so no tests were run'
            : `${failed.length} of ${code.total} tests failed${counts.size ? ` (${[...counts].map(([v,n]) => `${v} ×${n}`).join(', ')})` : ''}`;
      }
      if (adjustment?.manualAdjustment) row.analysis.reason += `; adjusted by instructor: ${adjustment.manualAdjustment > 0 ? '+' : ''}${adjustment.manualAdjustment}, ${adjustment.adjustReason ?? ''}`;
      return row;
    });
    const review: StudentSubmissionReview = { examId, title: exam.title, attemptId: attempt.id, submittedAt: attempt.submittedAt.toISOString(), published, gradeUnsubmittedCode: exam.gradeUnsubmittedCode, questions: rows };
    if (published && result) {
      const percentage = result.maxScore > 0 ? Math.round(result.score / result.maxScore * 10000) / 100 : 0;
      review.result = { score: result.score, maxScore: result.maxScore, percentage,
        passed: (exam as ExamEntity & { passMarkEnabled?: boolean }).passMarkEnabled === false ? null : percentage >= exam.passPercentage,
        gradingPending: rows.some(r => r.analysis?.gradingPending),
      };
    }
    return review;
  }
}
