// Owner: Person C (Electron, Kiosk & Security)
// Shown in a normal browser where an exam would start. The dashboard, results and
// the admin portal work in the browser; sitting the exam happens in the exam app.

import { MonitorSmartphone } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { examAppLink } from '../desktop/requireDesktop';

export function OpenInExamApp({ examId, resuming }: { examId: string; resuming: boolean }) {
  return (
    <div className="space-y-3">
      <Alert variant="info" title="This exam is taken in the Secure Exam app">
        The exam app locks your computer to the exam and records your activity. Your answers and timer are the same as in
        a browser. {resuming ? 'Open it to resume where you left off.' : 'Open it to begin.'}
      </Alert>
      <Button size="lg" asChild>
        <a href={examAppLink(examId)}>
          <MonitorSmartphone /> {resuming ? 'Resume in exam app' : 'Open in exam app'}
        </a>
      </Button>
      <p className="text-xs text-muted-foreground">
        Nothing happened? The Secure Exam app may not be installed on this computer. Ask your invigilator.
      </p>
    </div>
  );
}
