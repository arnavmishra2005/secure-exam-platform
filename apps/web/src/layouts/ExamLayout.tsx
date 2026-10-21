// Owner: Person A (shell) / Person C (contents)
// Full-screen layout for instructions, the exam itself and the submitted
// page: no navigation, so nothing invites a student to wander off. The
// attempt context lives here so all three screens share it.

import { Outlet } from 'react-router-dom';
import { ViolationBanner } from '@/features/exam-taking/desktop/ViolationBanner';
import { AttemptProvider } from '@/features/exam-taking/contexts/AttemptContext';

export function ExamLayout() {
  return (
    <div className="min-h-screen select-none bg-background">
      <ViolationBanner />
      <AttemptProvider>
        <Outlet />
      </AttemptProvider>
    </div>
  );
}
