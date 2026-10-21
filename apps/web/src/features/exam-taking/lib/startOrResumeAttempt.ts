// Owner: Person C. Start the student's attempt at an exam, or pick up the one already running.
// The server decides everything (registration, window, one attempt per student).

import { getMyAttemptForExam, startAttempt } from '@secure-exam/api-client';
import { AttemptStatus } from '@secure-exam/types';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';

export class AttemptUnavailableError extends Error {}

/** The id of the attempt to take. Throws AttemptUnavailableError with a message fit for the student. */
export async function startOrResumeAttempt(examId: string): Promise<string> {
  try {
    return (await startAttempt({ examId })).id;
  } catch (err) {
    // 409: already started (another window, or a restart of the app). Resume it if it is still running.
    if (getErrorStatus(err) === 409) {
      try {
        const existing = await getMyAttemptForExam(examId);
        if (existing.status === AttemptStatus.IN_PROGRESS) return existing.id;
        throw new AttemptUnavailableError('You have already submitted this exam.');
      } catch (inner) {
        if (inner instanceof AttemptUnavailableError) throw inner;
      }
    }
    throw new AttemptUnavailableError(getErrorMessage(err, 'Unable to start the exam. Please contact your invigilator.'));
  }
}
