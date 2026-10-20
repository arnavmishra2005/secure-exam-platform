/**
 * Owner: Person A (Platform, Courses, Publish, Results)
 *
 * Publishing an exam makes it visible to every registered student and sends
 * each of them an in-app notification. A DRAFT exam is scheduled as part of
 * publishing. Later registrations (new course enrollments, manual adds) are
 * notified as they are created.
 */

import type { Exam } from './exam.types';

export interface PublishExamRequest {
  /** Pass mark as a percentage of the exam's maximum score (0-100). */
  passPercentage?: number;
  /** Optional message appended to the notification. */
  message?: string;
}

export interface PublishExamResponse {
  exam: Exam;
  notifiedCount: number;
}

/** Pre-flight shown in the publish dialog. */
export interface PublishReadiness {
  examId: string;
  canPublish: boolean;
  registeredCount: number;
  questionCount: number;
  /** Human-readable reasons publishing is blocked. Empty when canPublish. */
  problems: string[];
}
