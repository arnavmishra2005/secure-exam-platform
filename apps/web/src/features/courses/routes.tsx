// Owner: Person A

import type { RouteObject } from 'react-router-dom';
import CourseDetailPage from './CourseDetailPage';
import CoursesListPage from './CoursesListPage';

export const courseRoutes: RouteObject[] = [
  { path: 'courses', element: <CoursesListPage /> },
  { path: 'courses/:courseId', element: <CourseDetailPage /> },
];
