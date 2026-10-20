import { Injectable } from '@nestjs/common';
import { RegistrationService } from '../../course/registration.service';
import { ExamService } from '../../exam/exam.service';
import { ExamLookupInfo, IExamLookupService } from './exam-lookup.interface';

@Injectable()
export class ExamLookupAdapter implements IExamLookupService {
  constructor(
    private readonly examService: ExamService,
    private readonly registrationService: RegistrationService,
  ) {}

  async getExamById(examId: string): Promise<ExamLookupInfo | null> {
    try {
      const exam = await this.examService.findOne(examId);
      return {
        id: exam.id,
        status: exam.status as ExamLookupInfo['status'],
        startTime: new Date(exam.startTime).toISOString(),
        endTime: new Date(exam.endTime).toISOString(),
        durationMinutes: exam.durationMinutes,
        publishedAt: exam.publishedAt ? new Date(exam.publishedAt).toISOString() : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * `studentId` is the JWT `sub` (a users.id). Registration is strict: Phase 1
   * let anyone into an exam with no assignments, and treated lookup errors as
   * "assigned"; both now deny.
   */
  async isStudentAssignedToExam(examId: string, studentId: string): Promise<boolean> {
    try {
      return await this.registrationService.isUserRegistered(examId, studentId);
    } catch {
      return false;
    }
  }

  async getExamTitles(examIds: string[]): Promise<Map<string, string>> {
    if (examIds.length === 0) return new Map();
    const exams = await this.examService.findManyByIds(examIds);
    return new Map(exams.map((e) => [e.id, e.title]));
  }
}
