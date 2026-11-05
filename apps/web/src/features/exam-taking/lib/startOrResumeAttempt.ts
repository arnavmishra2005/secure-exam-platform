// Owner: Person C. Start the student's attempt at an exam, or pick up the one already running.
// The server decides everything (registration, window, one attempt per student).

import { getMyAttemptForExam, startAttempt } from '@secure-exam/api-client';
import { AttemptStatus } from '@secure-exam/types';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';

export class AttemptUnavailableError extends Error {}

/** The id of the attempt to take. Throws AttemptUnavailableError with a message fit for the student. */
export async function startOrResumeAttempt(examId: string): Promise<string> {
  // An approved resumed attempt can outlive the exam's normal end time because
  // of a student extension. Do not apply new-attempt window checks to it.
  try {
    const existing = await getMyAttemptForExam(examId);
    if (existing.status === AttemptStatus.IN_PROGRESS) return existing.id;
    throw new AttemptUnavailableError('You have already submitted this exam.');
  } catch (error) {
    if (error instanceof AttemptUnavailableError) throw error;
    if (getErrorStatus(error) !== 404) throw new AttemptUnavailableError(getErrorMessage(error));
  }
  try {
    return (await startAttempt({ examId })).id;
  } catch (error) {
    if (getErrorStatus(error) === 409) {
      // Another request may have created this attempt after our initial read.
      const existing = await getMyAttemptForExam(examId);
      if (existing.status === AttemptStatus.IN_PROGRESS) return existing.id;
    }
    throw new AttemptUnavailableError(getErrorMessage(error, 'Unable to start the exam. Please contact your invigilator.'));
  }
}
