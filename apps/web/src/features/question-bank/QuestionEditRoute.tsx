// Owner: Person B
import { QuestionForm } from '@secure-exam/exam-content-ui';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { useCourseOptions } from './useCourseOptions';

export default function QuestionEditRoute() {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const courses = useCourseOptions();
  const back = () => navigate('/admin/questions');
  return (
    <div className="space-y-6">
      <PageHeader title={questionId ? 'Edit question' : 'New question'} />
      <QuestionForm
        key={questionId ?? 'new'}
        questionId={questionId}
        courses={courses}
        onSaved={back}
        onCancel={back}
        onDuplicated={(copy) => navigate(`/admin/questions/${copy.id}`)}
      />
    </div>
  );
}
