'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateQuestionRequest, QuestionWithOptions } from '@secure-exam/types';
import { getQuestion, updateQuestion } from '@/lib/api';
import { QuestionForm } from '@/components/question/QuestionForm';

/**
 * ADDITION: not explicitly listed in the original file-structure doc (which
 * only names questions/page.tsx, questions/new/page.tsx, questions/import/page.tsx),
 * but QuestionTable links here for "Edit" and the doc's own question.service
 * spec includes `update`. Flagging so the team can confirm the route name.
 *
 * NOTE: UpdateQuestionDto on the backend does not currently accept option
 * changes (only text/type/marks/negativeMarks/explanation) — see
 * question.service.ts. This form re-uses QuestionForm's option editor for
 * a good editing UX, but option edits made here are not yet sent to the
 * server. Extending PATCH /questions/:id to also sync options is a
 * reasonable Phase 1 follow-up; call it out to the team before relying on it.
 */
export default function EditQuestionPage({ params }: { params: { questionId: string } }) {
  const router = useRouter();
  const [question, setQuestion] = useState<QuestionWithOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQuestion(params.questionId)
      .then(setQuestion)
      .catch((err) => setError((err as Error).message));
  }, [params.questionId]);

  async function handleSubmit(data: CreateQuestionRequest) {
    await updateQuestion(params.questionId, {
      text: data.text,
      type: data.type,
      marks: data.marks,
      negativeMarks: data.negativeMarks,
      explanation: data.explanation,
    });
    router.push('/questions');
  }

  if (error) return <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-rose-600">{error}</div>;
  if (!question) return <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-stone-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold text-stone-900">Edit question</h1>
      <QuestionForm initial={question} onSubmit={handleSubmit} submitLabel="Save changes" />
    </div>
  );
}
