'use client';

import Link from 'next/link';
import { importQuestions } from '@/lib/api';
import { QuestionImport } from '@/components/question/QuestionImport';

export default function ImportQuestionsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Bulk import questions</h1>
        <Link href="/questions" className="text-sm text-indigo-600 hover:underline">
          Back to question bank
        </Link>
      </div>
      <QuestionImport onImport={importQuestions} />
    </div>
  );
}
