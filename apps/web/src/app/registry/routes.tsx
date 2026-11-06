// [SHARED — Day 1 contract] Feature routes, mounted by app/router.tsx under
// their layout. Add your feature's array as ONE line; don't reorder others'.
// Paths are relative to /instructor, /student, or the exam-taking layout.

import type { RouteObject } from 'react-router-dom';
import { courseRoutes } from '@/features/courses/routes';
import { dashboardRoutes } from '@/features/dashboard/routes';
import { examTakingRoutes } from '@/features/exam-taking/routes';
import { examManagementRoutes } from '@/features/exams/routes';
import { monitoringRoutes } from '@/features/monitoring/routes';
import { questionBankRoutes } from '@/features/question-bank/routes';
import { resultsRoutes } from '@/features/results/routes';
import { studentManagementRoutes } from '@/features/students/routes';

/** Under /instructor (instructors and TAs), inside StaffLayout. */
export const staffRoutes: RouteObject[] = [
  ...examManagementRoutes, // A
  ...courseRoutes, // A
  ...studentManagementRoutes, // A
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
