// [SHARED — Day 1 contract] Feature routes, mounted by app/router.tsx under
// their layout. Add your feature's array as ONE line; don't reorder others'.
// Paths are relative to /admin, /student, or the exam-taking layout.

import type { RouteObject } from 'react-router-dom';
import { courseRoutes } from '@/features/courses/routes';
import { dashboardRoutes } from '@/features/dashboard/routes';
import { examTakingRoutes } from '@/features/exam-taking/routes';
import { adminExamRoutes } from '@/features/exams/routes';
import { monitoringRoutes } from '@/features/monitoring/routes';
import { questionBankRoutes } from '@/features/question-bank/routes';
import { resultsRoutes } from '@/features/results/routes';
import { studentAdminRoutes } from '@/features/students/routes';

/** Under /admin, inside AdminLayout. */
export const adminRoutes: RouteObject[] = [
  ...adminExamRoutes, // A
  ...courseRoutes, // A
  ...studentAdminRoutes, // A
  ...resultsRoutes, // A (B adds the Questions tab via results/tabs.registry.ts)
  ...monitoringRoutes, // C
  ...questionBankRoutes, // B
];

/** Under /student, inside StudentLayout. */
export const studentRoutes: RouteObject[] = [
  ...dashboardRoutes, // C
];

/** Under /student, inside ExamLayout (full-screen, no navigation). */
export const examRoutes: RouteObject[] = [
  ...examTakingRoutes, // C
];
