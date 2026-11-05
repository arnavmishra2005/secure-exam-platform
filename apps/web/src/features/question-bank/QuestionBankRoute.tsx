// Owner: Person B
import { bankQueryFromParams, bankQueryToParams, QuestionBankPage } from '@secure-exam/exam-content-ui';
import type { BankQuestionQuery } from '@secure-exam/types';
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { useCourseOptions } from './useCourseOptions';

export default function QuestionBankRoute() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const courses = useCourseOptions();
  // Filters live in the URL, so Back (e.g. from editing a question) and refresh keep them.
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => bankQueryFromParams(params), [params]);
  const setQuery = useCallback(
    (q: BankQuestionQuery) => setParams(bankQueryToParams(q), { replace: true }),
    [setParams],
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Question bank" description="Reusable questions, including coding problems with hidden tests." />
      <QuestionBankPage
        onCreate={() => navigate('/admin/questions/new', { state: { bankSearch: search } })}
        onEdit={(id) => navigate(`/admin/questions/${id}`, { state: { bankSearch: search } })}
        courses={courses}
        query={query}
        onQueryChange={setQuery}
      />
    </div>
  );
}
