// Owner: Person A

import { updateExam } from '@secure-exam/api-client';
import { ExamStatus, Permission } from '@secure-exam/types';
import { useAccess } from '@/auth/useAccess';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import type { ExamTabProps } from '../examTabs.registry';
import { ExamForm } from '../ExamForm';

export function DetailsTab({ exam, onChanged }: ExamTabProps) {
  const canEdit = useAccess().can(Permission.EXAM_EDIT, exam.courseId);
  return (
    <Card>
      <CardContent className="pt-5">
        <ExamForm
          key={exam.updatedAt}
          initial={exam}
          submitLabel="Save changes"
          timingLocked={exam.status !== ExamStatus.DRAFT}
          readOnly={!canEdit}
          onSubmit={async (data) => {
            await updateExam(exam.id, data);
            toast.success('Exam saved');
            onChanged();
          }}
        />
      </CardContent>
    </Card>
  );
}
