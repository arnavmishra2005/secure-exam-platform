'use client';

import { useRouter } from 'next/navigation';
import { CreateExamRequest } from '@secure-exam/types';
import { createExam } from '@/lib/api';
import { ExamForm } from '@/components/exam/ExamForm';

export default function NewExamPage() {
  const router = useRouter();

  async function handleSubmit(data: CreateExamRequest) {
    const exam = await createExam(data);
    router.push(`/exams/${exam.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold text-stone-900">New exam</h1>
      <ExamForm onSubmit={handleSubmit} submitLabel="Create exam" />
    </div>
  );
}
