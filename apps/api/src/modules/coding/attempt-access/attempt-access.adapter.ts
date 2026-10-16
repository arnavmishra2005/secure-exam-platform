import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '@secure-exam/types';
import { SubmissionService } from '../../answer/submission.service';
import { IAttemptAccess, WritableAttempt } from './attempt-access.interface';

/** Binds IAttemptAccess to the answer module's own guard, so the rules can't drift. */
@Injectable()
export class AttemptAccessAdapter implements IAttemptAccess {
  constructor(private readonly submissionService: SubmissionService) {}

  async assertWritable(attemptId: string, user: JwtPayload): Promise<WritableAttempt> {
    const attempt = await this.submissionService.assertAttemptIsWritable(attemptId, user);
    return { id: attempt.id, examId: attempt.examId, studentId: attempt.studentId };
  }
}
