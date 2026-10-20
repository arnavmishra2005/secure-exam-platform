// Owner: Person A

import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import ResultsExamListPage from './ResultsExamListPage';

// Charts (Recharts) are only needed here; keep them out of the main bundle.
const ResultsExamDetailPage = lazy(() => import('./ResultsExamDetailPage'));

export const resultsRoutes: RouteObject[] = [
  { path: 'results', element: <ResultsExamListPage /> },
  {
    path: 'results/:examId',
    element: (
      <Suspense fallback={<Spinner label="Loading results" />}>
        <ResultsExamDetailPage />
      </Suspense>
    ),
  },
];
