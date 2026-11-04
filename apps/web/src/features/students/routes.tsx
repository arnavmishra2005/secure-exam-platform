// Owner: Person A

import type { RouteObject } from 'react-router-dom';
import StudentsPage from './StudentsPage';

export const studentManagementRoutes: RouteObject[] = [{ path: 'students', element: <StudentsPage /> }];
