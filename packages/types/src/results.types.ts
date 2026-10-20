/**
 * Owner: Person A (Platform, Courses, Publish, Results)
 *
 * Per-question scores are written through the ScoreRecorder contract
 * (apps/api/src/common/scoring). Person A's MCQ evaluator records AUTO_MCQ
 * scores when an attempt is submitted; Person B's code grader records
 * AUTO_CODE. Result.score is always the sum of an attempt's QuestionScores.
 */

export enum ScoreSource {
  AUTO_MCQ = 'AUTO_MCQ',
  AUTO_CODE = 'AUTO_CODE',
  MANUAL = 'MANUAL',
}

export interface QuestionScore {
  id: string;
  attemptId: string;
  examId: string;
  /** users.id — same as attempts.studentId. */
  studentId: string;
  questionId: string;
  source: ScoreSource;
  /** May be negative when negative marking applies. */
  score: number;
  maxScore: number;
  /** null when the student did not answer. */
  isCorrect: boolean | null;
  details: Record<string, unknown> | null;
  gradedAt: string;
}

/** Status of a registered student's attempt at an exam. */
export enum StudentAttemptStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  AUTO_SUBMITTED = 'AUTO_SUBMITTED',
}

/** One row of GET /results/exams: the exam picker on the results page. */
export interface ExamResultsSummary {
  examId: string;
  title: string;
  status: string;
  startTime: string;
  endTime: string;
  publishedAt: string | null;
  registeredCount: number;
  submittedCount: number;
  /** Mean percentage across finalized attempts, or null if none. */
  averagePercentage: number | null;
  passRate: number | null;
}

export interface HistogramBucket {
  /** Inclusive lower bound, in percent. */
  from: number;
  /** Exclusive upper bound, in percent (the last bucket includes 100). */
  to: number;
  count: number;
}

export interface ExamResultsOverview {
  examId: string;
  title: string;
  maxScore: number;
  passPercentage: number;
  registeredCount: number;
  startedCount: number;
  submittedCount: number;
  inProgressCount: number;
  absentCount: number;
  /** Score statistics over finalized attempts; null when there are none. */
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  standardDeviation: number | null;
  /** 0-100, or null when there are no finalized attempts. */
  passRate: number | null;
  passedCount: number;
  /** Percentage-score distribution in 10-point buckets. */
  histogram: HistogramBucket[];
  /** Mean of (submittedAt - startedAt) in seconds over finalized attempts. */
  averageTimeSeconds: number | null;
  needsManualReviewCount: number;
}

export interface StudentResultRow {
  /** 1-based rank by score among finalized attempts; null otherwise. */
  rank: number | null;
  /** students.id, or null if the attempt's user has no student record. */
  studentId: string | null;
  /** users.id */
  userId: string;
  collegeId: string | null;
  fullName: string;
  email: string;
  status: StudentAttemptStatus;
  attemptId: string | null;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  passed: boolean | null;
  timeTakenSeconds: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  resultPublished: boolean;
  needsManualReview: boolean;
  /**
   * Security-violation count from Person C's client-security module.
   * null until that module is merged (stub column).
   */
  violationCount: number | null;
}

export interface ExamStudentResults {
  examId: string;
  maxScore: number;
  passPercentage: number;
  items: StudentResultRow[];
}

export interface PublishResultsResponse {
  publishedCount: number;
}
