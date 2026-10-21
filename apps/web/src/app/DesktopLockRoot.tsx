// Owner: Person C (Electron, Kiosk & Security)
// In the exam app, only the launch screen, the exam and the "submitted" screen exist.
// Everything else (dashboard, admin, login...) sends the student back to the launch screen.
// Keep this list in step with apps/exam-client/src/main/allowedPaths.ts, which enforces
// the same rule from the other side. In a browser this component does nothing.

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ATTEMPT_ID_KEY } from '@/features/exam-taking/contexts/AttemptContext';
import { isDesktop } from '@/features/exam-taking/desktop/desktop';

const ALLOWED = new Set(['/launch', '/student/exam', '/student/exam/submitted']);

export function DesktopLockRoot() {
  const { pathname } = useLocation();
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (isDesktop() && !ALLOWED.has(clean)) {
    // A stray route must never eject a student from an exam in progress: send them back to it.
    let running = false;
    try {
      running = sessionStorage.getItem(ATTEMPT_ID_KEY) !== null;
    } catch {
      // storage unavailable: fall back to the launch screen
    }
    return <Navigate to={running ? '/student/exam' : '/launch'} replace />;
  }
  return <Outlet />;
}
