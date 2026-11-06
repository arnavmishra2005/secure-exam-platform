import { ConflictException } from '@nestjs/common';
import { Role, type JwtPayload } from '@secure-exam/types';
import type { AttemptEntity } from './entities/attempt.entity';
export function assertAttemptSession(attempt: AttemptEntity, user: JwtPayload): void {
  if (user.role !== Role.STUDENT) return;
  if ((user.examId && user.examId !== attempt.examId) ||
      (attempt.activeSessionId && attempt.activeSessionId !== user.examSessionId)) {
    throw new ConflictException({ code: 'SESSION_MOVED', message: 'This exam was opened on another device. Ask your invigilator for help.' });
  }
}
