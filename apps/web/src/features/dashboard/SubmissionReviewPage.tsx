import { getMySubmission } from '@secure-exam/api-client';
import { CODE_LANGUAGES, CodeLanguage, QuestionType, decodeCodeDraft } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { Spinner } from '@/components/ui/spinner';
import { ReviewScore } from '../exam-taking/components/ReviewScore';
import { QuestionRenderer } from '../exam-taking/components/QuestionRenderer';
import { formatDateTime, formatPercent, formatScore } from '@/lib/format';
import { getErrorMessage } from '@/lib/errors';
const Markdown = lazy(() => import('@secure-exam/exam-content-ui').then(m => ({ default: m.Markdown })));
const CodeEditor = lazy(() => import('@secure-exam/exam-content-ui').then(m => ({ default: m.CodeEditor })));

export default function SubmissionReviewPage() {
  const { examId = '' } = useParams();
  const query = useQuery({ queryKey: ['me', 'submission', examId], queryFn: () => getMySubmission(examId), refetchInterval: 30_000 });
  if (query.isPending) return <Spinner label="Loading your submission" />;
  if (query.error) return <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />;
  const review = query.data;
  return <div className="space-y-6">
    <Link className="text-sm text-primary underline" to="/student/dashboard">Back to dashboard</Link>
    <PageHeader title={review.title} description={`Submitted ${formatDateTime(review.submittedAt)}`} />
    {!review.published && <Alert variant="info">Your submitted answers are below. Marks, explanations and correct answers appear after results are published.</Alert>}
    {review.result && <Card><CardContent className="flex flex-wrap gap-4 pt-6">
      <strong>{formatScore(review.result.score)} / {formatScore(review.result.maxScore)}</strong>
      <span>{formatPercent(review.result.percentage)}</span>
      {review.result.passed !== null && !review.result.gradingPending && <span>{review.result.passed ? 'Passed' : 'Not passed'}</span>}
      {review.result.gradingPending && <span role="status">Grading in progress — totals may change</span>}
    </CardContent></Card>}
    {review.questions.map((row, index) => <section key={row.question.id} aria-label={`Question ${index + 1}`} className="space-y-3">
      {row.question.type === QuestionType.CODING ? <Card><CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <h2 className="font-serif text-lg font-semibold">Question {index + 1} of {review.questions.length} · Coding</h2>
          {row.analysis ? <ReviewScore analysis={row.analysis} /> : <span className="text-sm">{row.question.marks} marks</span>}
        </div>
        <h3 className="font-semibold">{row.question.text}</h3>
        <Suspense fallback={<Spinner label="Loading question" />}><Markdown source={row.question.coding?.statementMd ?? ''} omitTitle={row.question.text} /></Suspense>
        {(() => {
          // A saved draft carries its language in a hidden first line (#16); show the code only.
          const draft = decodeCodeDraft(row.textResponse);
          const shown = row.code?.code ? row.code : { code: draft.code, language: draft.language ?? CodeLanguage.PYTHON };
          return <>
            <p className="text-sm text-muted-foreground">{row.code && !row.code.fromDraft ? `Submitted ${formatDateTime(row.code.submittedAt)} · ${CODE_LANGUAGES[row.code.language]?.label ?? row.code.language}` : shown.code ? 'No explicit code submission. Saved draft shown below.' : 'No code submitted.'}</p>
            <div className="h-80"><Suspense fallback={<Spinner label="Loading code" />}><CodeEditor value={shown.code} language={CODE_LANGUAGES[shown.language]?.monacoId ?? 'python'} onChange={() => {}} readOnly hardened={false} /></Suspense></div>
          </>;
        })()}
        {row.analysis && <div className="space-y-3">
          <p className="text-sm">{row.analysis.reason}</p>
          {row.analysis.tests?.map(test => <details key={test.index} className={`rounded border p-3 text-sm ${test.verdict === 'PASSED' ? 'border-emerald-600 bg-emerald-500/5' : 'border-red-600 bg-red-500/5'}`}>
            <summary className="cursor-pointer font-medium">{test.isSample ? 'Sample' : 'Hidden test'} {test.index}: {test.verdict.replaceAll('_', ' ')}{test.errorKind ? ` · ${test.errorKind}` : ''} · {test.timeMs} ms</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{[['Input',test.input],['Expected output',test.expectedOutput],['Your output',test.stdout],['Errors',test.stderr]].map(([label,value]) => <div key={label} className="min-w-0"><h4 className="font-medium">{label}</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2">{value === undefined ? 'Unavailable' : value || '(empty)'}</pre></div>)}</div>
          </details>)}
        </div>}
      </CardContent></Card> : <QuestionRenderer question={row.question} questionNumber={index + 1} totalQuestions={review.questions.length}
        selectedOptionIds={row.selectedOptionIds} textResponse={row.textResponse ?? ''} onSelectOption={() => {}} onTextResponseChange={() => {}} disabled review analysis={row.analysis} />}
      {row.markedForReview && <p className="text-sm text-muted-foreground">Marked for review during the exam</p>}
    </section>)}
  </div>;
}
