/**
 * Owner: Person C. Mounted under /student inside ExamLayout (no navigation).
 */

import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { FullPageSpinner } from '@/components/ui/spinner';
import InstructionsPage from './pages/InstructionsPage';
import SubmittedPage from './pages/SubmittedPage';

const ExamPage = lazy(() => import('./pages/ExamPage'));

export const examTakingRoutes: RouteObject[] = [
  { path: 'exams/:examId', element: <InstructionsPage /> },
  {
    path: 'exam',
    element: (
      <Suspense fallback={<FullPageSpinner label="Loading the exam" />}>
        <ExamPage />
      </Suspense>
    ),
  },
  { path: 'exam/submitted', element: <SubmittedPage /> },
];
