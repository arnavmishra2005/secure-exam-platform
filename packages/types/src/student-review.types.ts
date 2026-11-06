import type { PublicQuestion } from './question.types';
import type { CodeLanguage, CodeSubmissionStatus, TestCaseVerdict } from './coding.types';

/** Own submission only. No grading data is returned before publication. */
export interface LatestCodeSubmission {
  questionId: string;
  submissionId: string;
  code: string;
  language: CodeLanguage;
  savedAt: string;
  status: CodeSubmissionStatus;
}
export interface StudentTestReview {
  index: number;
  isSample: boolean;
  verdict: TestCaseVerdict;
  errorKind?: string;
  timeMs: number;
  input?: string;
  expectedOutput?: string;
  stdout?: string;
  stderr?: string;
}
export interface StudentQuestionReview {
  question: PublicQuestion;
  selectedOptionIds: string[];
  textResponse: string | null;
  markedForReview: boolean;
  code?: { code: string; language: CodeLanguage; submittedAt: string | null; fromDraft: boolean };
  analysis?: {
    score: number | null;
    maxScore: number;
    correctOptionIds?: string[];
    explanation?: string | null;
    passed?: number;
    total?: number;
    tests?: StudentTestReview[];
    gradingPending: boolean;
    reason: string;
    autoScore?: number;
    manualAdjustment?: number;
    adjustReason?: string;
  };
}
export interface StudentSubmissionReview {
  examId: string;
  title: string;
  attemptId: string;
  submittedAt: string;
  published: boolean;
  gradeUnsubmittedCode: boolean;
  questions: StudentQuestionReview[];
  result?: { score: number; maxScore: number; percentage: number; passed: boolean | null; gradingPending: boolean };
}
export interface CaptchaChallenge { captchaId: string; svg: string; }
