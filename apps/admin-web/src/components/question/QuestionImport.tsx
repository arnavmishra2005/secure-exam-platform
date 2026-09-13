'use client';

import { ChangeEvent, useState } from 'react';
import { BulkImportResult } from '@secure-exam/types';

interface Props {
  onImport: (file: File) => Promise<BulkImportResult>;
}

export function QuestionImport({ onImport }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await onImport(file);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-600">
        <p className="font-medium text-stone-800">CSV format</p>
        <code className="mt-1 block overflow-x-auto whitespace-pre text-xs">
          text,type,marks,negativeMarks,option1,isCorrect1,option2,isCorrect2,option3,isCorrect3,option4,isCorrect4
        </code>
        <p className="mt-2">
          <code>type</code> is one of MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE. Leave trailing option
          columns blank if a question has fewer than four options.
        </p>
      </div>

      <input type="file" accept=".csv" onChange={handleFileChange} className="text-sm" />

      <button
        onClick={handleImport}
        disabled={!file || submitting}
        className="block bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Importing…' : 'Import'}
      </button>

      {error && (
        <div className="border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {result && (
        <div className="border border-stone-300 px-4 py-3 text-sm">
          <p className="font-medium text-emerald-700">{result.createdCount} question(s) imported.</p>
          {result.errors.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-rose-700">{result.errors.length} row(s) failed:</p>
              <ul className="mt-1 list-inside list-disc text-rose-600">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
