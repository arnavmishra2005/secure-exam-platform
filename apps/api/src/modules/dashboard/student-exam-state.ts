/**
 * Owner: Person C (Time Extension, Dashboard)
 * Pure classification of an exam from one student's point of view — unit tested.
 */

import { AttemptStatus, ExamStatus, StudentExamState } from '@secure-exam/types';

export interface ExamTiming {
  status: ExamStatus;
  startTime: Date;
  endTime: Date;
}

export function classifyStudentExam(
  exam: ExamTiming,
  attemptStatus: AttemptStatus | null,
  now: Date,
): StudentExamState {
  if (attemptStatus === AttemptStatus.SUBMITTED || attemptStatus === AttemptStatus.AUTO_SUBMITTED) {
    return StudentExamState.COMPLETED;
  }
  // A running attempt is live until the server finalizes it, even if its timer just ran out.
  if (attemptStatus === AttemptStatus.IN_PROGRESS) return StudentExamState.LIVE;

  if (exam.status === ExamStatus.CLOSED || now.getTime() > exam.endTime.getTime()) {
    return StudentExamState.MISSED;
  }
  if (exam.status === ExamStatus.ACTIVE && now.getTime() >= exam.startTime.getTime()) {
    return StudentExamState.LIVE;
  }
  return StudentExamState.UPCOMING;
}
