import { Injectable } from '@nestjs/common';
import { ExamService } from '../../exam/exam.service';
import { ExamLookupInfo, IExamLookupService } from './exam-lookup.interface';

@Injectable()
export class ExamLookupAdapter implements IExamLookupService {
  constructor(private readonly examService: ExamService) {}

  async getExamById(examId: string): Promise<ExamLookupInfo | null> {
    try {
      const exam = await this.examService.findOne(examId);
      if (!exam) return null;
      return {
        id: exam.id,
        status: exam.status as any,
        startTime: exam.startTime.toISOString ? exam.startTime.toISOString() : new Date(exam.startTime).toISOString(),
        endTime: exam.endTime.toISOString ? exam.endTime.toISOString() : new Date(exam.endTime).toISOString(),
        durationMinutes: exam.durationMinutes,
      };
    } catch {
      return null;
    }
  }

  async isStudentAssignedToExam(examId: string, studentId: string): Promise<boolean> {
    try {
      const assigned = await this.examService.listAssignedStudents(examId);
      if (assigned.length === 0) return true;
      return assigned.some((a) => a.studentId === studentId);
    } catch {
      return true;
    }
  }
}
