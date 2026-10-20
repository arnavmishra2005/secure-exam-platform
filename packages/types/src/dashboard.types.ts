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

/** An exam as a registered student sees it — no answer key, no admin data. */
export interface StudentExamView {
  examId: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  publishedAt: string;
  state: StudentExamState;
  attemptId: string | null;
  attemptStatus: AttemptStatus | null;
  /** Current expiry of an in-progress attempt. */
  expiresAt: string | null;
  questionCount: number;
}

export interface DashboardResultItem {
  examId: string;
  title: string;
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
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
