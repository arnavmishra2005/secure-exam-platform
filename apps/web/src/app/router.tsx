// [SHARED] The route tree. Feature routes come from app/registry/routes.tsx.

import { Role } from '@secure-exam/types';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { homePathFor, useAuth } from '@/auth/AuthContext';
import { RequireRole } from '@/auth/RequireRole';
import { FullPageSpinner } from '@/components/ui/spinner';
import LoginPage from '@/features/auth/LoginPage';
import NotFoundPage from '@/features/auth/NotFoundPage';
import { AdminLayout } from '@/layouts/AdminLayout';
import { ExamLayout } from '@/layouts/ExamLayout';
import { StudentLayout } from '@/layouts/StudentLayout';
import { AttemptProvider } from '@/features/exam-taking/contexts/AttemptContext';
import LaunchPage from '@/features/exam-taking/pages/LaunchPage';
import { DesktopLockRoot } from './DesktopLockRoot';
import { adminRoutes, examRoutes, studentRoutes } from './registry/routes';

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner label="Restoring your session" />;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

export const router = createBrowserRouter([
  {
    // In the exam app this limits the whole route tree to the launch, exam and submitted screens.
    element: <DesktopLockRoot />,
    children: [
      { path: '/', element: <RootRedirect /> },
      // The exam app's front door: reached only through a one-time launch link.
      {
        path: '/launch',
        element: (
          <AttemptProvider>
            <LaunchPage />
          </AttemptProvider>
        ),
      },
      { path: '/login', element: <LoginPage /> },
      {
        path: '/admin',
        element: <RequireRole role={Role.ADMIN} />,
        children: [
          {
            element: <AdminLayout />,
            children: [{ index: true, element: <Navigate to="exams" replace /> }, ...adminRoutes],
          },
        ],
      },
      {
        path: '/student',
        element: <RequireRole role={Role.STUDENT} />,
        children: [
          {
            element: <StudentLayout />,
            children: [{ index: true, element: <Navigate to="dashboard" replace /> }, ...studentRoutes],
          },
          { element: <ExamLayout />, children: examRoutes },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
