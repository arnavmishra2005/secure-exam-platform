// [SHARED] The route tree. Feature routes come from app/registry/routes.tsx.

import { Role, STAFF_ROLES } from '@secure-exam/types';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { homePathFor, useAuth } from '@/auth/AuthContext';
import { RequireRole } from '@/auth/RequireRole';
import { FullPageSpinner } from '@/components/ui/spinner';
import LoginPage from '@/features/auth/LoginPage';
import NotFoundPage from '@/features/auth/NotFoundPage';
import { StaffLayout } from '@/layouts/StaffLayout';
import { ExamLayout } from '@/layouts/ExamLayout';
import { StudentLayout } from '@/layouts/StudentLayout';
import { AttemptProvider } from '@/features/exam-taking/contexts/AttemptContext';
import LaunchPage from '@/features/exam-taking/pages/LaunchPage';
import { DesktopLockRoot } from './DesktopLockRoot';
import { examRoutes, staffRoutes, studentRoutes } from './registry/routes';

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner label="Restoring your session" />;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

/** Old /admin/... links (bookmarks, notifications) still work. */
function LegacyAdminRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={pathname.replace(/^\/admin/, '/instructor') + search} replace />;
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
        path: '/instructor',
        element: <RequireRole roles={STAFF_ROLES} />,
        children: [
          {
            element: <StaffLayout />,
            children: [{ index: true, element: <Navigate to="exams" replace /> }, ...staffRoutes],
          },
        ],
      },
      { path: '/admin/*', element: <LegacyAdminRedirect /> },
      {
        path: '/student',
        element: <RequireRole roles={[Role.STUDENT]} />,
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
