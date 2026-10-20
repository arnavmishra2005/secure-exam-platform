// Owner: Person B
import { QuestionBankPage } from '@secure-exam/exam-content-ui';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { useCourseOptions } from './useCourseOptions';

export default function QuestionBankRoute() {
  const navigate = useNavigate();
  const courses = useCourseOptions();
  return (
    <div className="space-y-6">
      <PageHeader title="Question bank" description="Reusable questions, including coding problems with hidden tests." />
      <QuestionBankPage onCreate={() => navigate('/admin/questions/new')} onEdit={(id) => navigate(`/admin/questions/${id}`)} courses={courses} />
    </div>
  );
}
