// Owner: Person C (Electron, Kiosk & Security)
// Wraps the exam screen itself. A browser that lands here (an old link, a typed URL)
// gets an explanation instead of an exam it could not load anyway.

import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isDesktop } from '../desktop/desktop';
import { REQUIRE_DESKTOP_EXAM } from '../desktop/requireDesktop';

export function DesktopOnly({ children }: { children: React.ReactNode }) {
  if (!REQUIRE_DESKTOP_EXAM || isDesktop()) return <>{children}</>;
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-12">
      <Alert variant="info" title="Open this exam in the Secure Exam app">
        Exams are taken in the Secure Exam app, not in a browser. Go to your dashboard, pick the exam and choose “Open in exam
        app”.
      </Alert>
      <Button asChild variant="outline">
        <Link to="/student/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
