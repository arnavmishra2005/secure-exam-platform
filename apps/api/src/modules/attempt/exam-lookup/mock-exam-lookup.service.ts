import { Injectable } from '@nestjs/common';
import { ExamLookupInfo, IExamLookupService } from './exam-lookup.interface';

/**
 * Development/test stand-in for Person B's Exam module.
 *
 * Behaviour:
 *  - Any (already UUID-validated) examId resolves to an ACTIVE exam whose
 *    window is "now - 5 min" .. "now + 2 hours", 60-minute duration.
 *  - Every student is considered assigned to every exam.
 *
 * This is intentionally permissive so Attempt eligibility/timer logic can
 * be exercised end-to-end (e.g. via Postman/Swagger) before Person B's
 * Exam module exists — matches the file-structure doc's guidance that C
 * "can develop against mock Exam/Question fixtures first and swap to real
 * repositories once B's entities land."
 */
@Injectable()
export class MockExamLookupService implements IExamLookupService {
  async getExamById(examId: string): Promise<ExamLookupInfo | null> {
    if (!examId) return null;
    const now = Date.now();
    return {
      id: examId,
      status: 'ACTIVE',
      startTime: new Date(now - 5 * 60_000).toISOString(),
      endTime: new Date(now + 2 * 60 * 60_000).toISOString(),
      durationMinutes: 60,
    };
  }

  async isStudentAssignedToExam(_examId: string, _studentId: string): Promise<boolean> {
    return true;
  }
}

/**
 * INTEGRATION: once Person B's real Exam module is ready, replace the
 * provider binding in attempt.module.ts:
 *
 *   { provide: EXAM_LOOKUP_SERVICE, useClass: MockExamLookupService }
 *
 * with an adapter implementing IExamLookupService against B's real
 * ExamService/ExamEntity, e.g.:
 *
 *   @Injectable()
 *   export class ExamLookupAdapter implements IExamLookupService {
 *     constructor(private readonly examService: ExamService) {}
 *
 *     async getExamById(examId: string): Promise<ExamLookupInfo | null> {
 *       const exam = await this.examService.findById(examId);
 *       if (!exam) return null;
 *       return {
 *         id: exam.id,
 *         status: exam.status, // cast/map if B's enum values differ
 *         startTime: exam.startTime,
 *         endTime: exam.endTime,
 *         durationMinutes: exam.durationMinutes,
 *       };
 *     }
 *
 *     async isStudentAssignedToExam(examId: string, studentId: string): Promise<boolean> {
 *       return this.examService.isStudentAssigned(examId, studentId);
 *     }
 *   }
 *
 * No other file in the attempt module needs to change — everything else
 * (AttemptService, AttemptController, tests) depends only on the
 * IExamLookupService interface.
 */
