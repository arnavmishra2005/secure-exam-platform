/**
 * Owner: Person C
 */

import type { RouteObject } from 'react-router-dom';
import StudentDashboardPage from './StudentDashboardPage';

export const dashboardRoutes: RouteObject[] = [{ path: 'dashboard', element: <StudentDashboardPage /> }];
