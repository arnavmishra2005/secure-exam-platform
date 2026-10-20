// Owner: Person A

import type { RouteObject } from 'react-router-dom';
import ExamCreatePage from './ExamCreatePage';
import ExamDetailPage from './ExamDetailPage';
import ExamsListPage from './ExamsListPage';

export const adminExamRoutes: RouteObject[] = [
  { path: 'exams', element: <ExamsListPage /> },
  { path: 'exams/new', element: <ExamCreatePage /> },
  { path: 'exams/:examId', element: <ExamDetailPage /> },
];
