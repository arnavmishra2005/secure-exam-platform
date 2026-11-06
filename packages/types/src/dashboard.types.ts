/**
 * Owner: Person C (Time Extension, Dashboard)
 *
 * GET /me/dashboard — one call that powers the student dashboard. Only
 * exams the student is registered for AND that have been published appear.
 */

import type { AttemptStatus } from './attempt.types';
import type { Notification } from './notification.types';

export enum StudentExamState {
  /** Published, not yet open for starting. */
  UPCOMING = 'UPCOMING',
  /** Open now and the student can start or resume it. */
  LIVE = 'LIVE',
  /** The student finished it (submitted or auto-submitted). */
  COMPLETED = 'COMPLETED',
  /** The window closed without the student starting. */
  MISSED = 'MISSED',
}

/** An exam as a registered student sees it — no answer key, no staff data. */
export interface StudentExamView {
  examId: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  /** The start time when the exam was published; differs from startTime once it was moved. */
  originalStartTime: string | null;
  /** True when the instructor moved the exam after publishing it. */
  rescheduled: boolean;
  /** The instructor's note about the change, if any. */
  scheduleNote: string | null;
  publishedAt: string;
  state: StudentExamState;
  attemptId: string | null;
  attemptStatus: AttemptStatus | null;
  /** Current expiry of an in-progress attempt. */
  expiresAt: string | null;
  questionCount: number;
  extendedMinutes?: number;
  gradeUnsubmittedCode?: boolean;
}

export interface DashboardResultItem {
  examId: string;
  title: string;
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  /** null when the exam has no pass mark. */
  passed: boolean | null;
  publishedAt: string;
}

export interface StudentDashboard {
  serverTime: string;
  student: {
    userId: string;
    studentId: string | null;
    fullName: string;
    email: string;
    collegeId: string | null;
  };
  live: StudentExamView[];
  upcoming: StudentExamView[];
  completed: StudentExamView[];
  results: DashboardResultItem[];
  notifications: {
    unreadCount: number;
    latest: Notification[];
  };
}
