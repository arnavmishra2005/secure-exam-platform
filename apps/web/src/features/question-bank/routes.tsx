// Owner: Person B. Admin question bank, mounted under /admin.
// Lazy: the coding problem editor pulls in Monaco.

import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';

const QuestionBankPage = lazy(() => import('./QuestionBankRoute'));
const QuestionEditPage = lazy(() => import('./QuestionEditRoute'));

const wrap = (el: JSX.Element) => <Suspense fallback={<Spinner label="Loading the question bank" />}>{el}</Suspense>;

export const questionBankRoutes: RouteObject[] = [
  { path: 'questions', element: wrap(<QuestionBankPage />) },
  { path: 'questions/new', element: wrap(<QuestionEditPage />) },
  { path: 'questions/:questionId', element: wrap(<QuestionEditPage />) },
];
