// Owner: Person B
import { QuestionForm } from '@secure-exam/exam-content-ui';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { useCourseOptions } from './useCourseOptions';

export default function QuestionEditRoute() {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const courses = useCourseOptions();
  // Return to the bank with the filters it had (QuestionBankRoute passes them along).
  const bankSearch = (state as { bankSearch?: string } | null)?.bankSearch ?? '';
  const back = () => navigate(`/instructor/questions${bankSearch}`);
  return (
    <div className="space-y-6">
      <PageHeader title={questionId ? 'Edit question' : 'New question'} />
      <QuestionForm
        key={questionId ?? 'new'}
        questionId={questionId}
        courses={courses}
        onSaved={back}
        onCancel={back}
        onDuplicated={(copy) => navigate(`/instructor/questions/${copy.id}`, { state: { bankSearch } })}
      />
    </div>
  );
}
