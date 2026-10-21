/**
 * Owner: Person B. Public entry of @secure-exam/exam-content-ui.
 *
 * Host requirements (see README.md): React 18, a QueryClientProvider,
 * Tailwind scanning this package's src/, Vite aliases for
 * @secure-exam/types and @secure-exam/api-client, and lazy-loading the
 * routes that render editors (Monaco is large).
 */
export { ExamContentApiProvider, defaultExamContentApi, useExamContentApi, type ExamContentApi } from './api/ExamContentApi';

// Question bank (admin)
export { QuestionBankPage } from './question-bank/QuestionBankPage';
export { QuestionForm } from './question-bank/QuestionForm';
export { PickForExamDialog } from './question-bank/PickForExamDialog';
export { ImportDialog } from './question-bank/ImportDialog';
export type { CourseOption } from './question-bank/labels';

// Coding (admin authoring + student exam view)
export { CodingProblemEditor } from './coding/authoring/CodingProblemEditor';
export { CodingQuestionView, type CodingQuestionViewProps } from './coding/CodingQuestionView';
export { desktopLocalRunner } from './coding/localRunner';
export { CodeEditor } from './coding/editor/CodeEditor';

// Results (admin): Person A's results page adds this as the "Questions" tab
export { QuestionsTab } from './results/QuestionsTab';
