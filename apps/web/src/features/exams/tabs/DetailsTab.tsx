// Owner: Person A

import { updateExam } from '@secure-exam/api-client';
import { ExamStatus } from '@secure-exam/types';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import type { ExamTabProps } from '../examTabs.registry';
import { ExamForm } from '../ExamForm';

export function DetailsTab({ exam, onChanged }: ExamTabProps) {
  return (
    <Card>
      <CardContent className="pt-5">
        <ExamForm
          key={exam.updatedAt}
          initial={exam}
          submitLabel="Save changes"
          timingLocked={exam.status !== ExamStatus.DRAFT}
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
