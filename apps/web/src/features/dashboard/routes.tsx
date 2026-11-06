/**
 * Owner: Person C
 */

import type { RouteObject } from 'react-router-dom';
import SubmissionReviewPage from './SubmissionReviewPage';
import StudentDashboardPage from './StudentDashboardPage';

export const dashboardRoutes: RouteObject[] = [{ path: 'dashboard', element: <StudentDashboardPage /> }, { path: 'exams/:examId/submission', element: <SubmissionReviewPage /> }];
