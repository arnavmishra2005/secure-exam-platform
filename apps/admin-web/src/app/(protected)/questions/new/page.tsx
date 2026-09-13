'use client';

import { useRouter } from 'next/navigation';
import { CreateQuestionRequest } from '@secure-exam/types';
import { createQuestion } from '@/lib/api';
import { QuestionForm } from '@/components/question/QuestionForm';

export default function NewQuestionPage() {
  const router = useRouter();

  async function handleSubmit(data: CreateQuestionRequest) {
    await createQuestion(data);
    router.push('/questions');
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold text-stone-900">New question</h1>
      <QuestionForm onSubmit={handleSubmit} submitLabel="Create question" />
    </div>
  );
}
