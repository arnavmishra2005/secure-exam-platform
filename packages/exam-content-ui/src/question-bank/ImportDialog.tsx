/** Owner: Person B. CSV import into the bank, with per-line errors. */
import { useState } from 'react';
import type { BulkImportResult } from '@secure-exam/types';
import { errorMessage } from '../api/ExamContentApi';
import { Alert, Button, Dialog } from '../ui';
import { useBankMutations } from './hooks';

export const IMPORT_TEMPLATE =
  'text,type,marks,negative_marks,difficulty,topic,tags,status,option1,option2,option3,option4,correct\n' +
  '"What is 2 + 2?",MCQ_SINGLE,1,,EASY,Arithmetic,math;basics,READY,3,4,5,22,2\n' +
  '"Pick the prime numbers",MCQ_MULTI,2,,MEDIUM,Number theory,math,READY,2,4,7,9,1;3\n' +
  '"Python lists are mutable",TRUE_FALSE,1,,EASY,Python,python,READY,,,,,true\n';

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { importCsv } = useBankMutations();

  const close = () => {
    setFile(null);
    setResult(null);
    setError(null);
    onClose();
  };
  const run = async () => {
    if (!file) return;
    setError(null);
    try {
      setResult(await importCsv.mutateAsync(file));
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`;

  return (
    <Dialog
      open={open}
      title="Import questions from CSV"
      onClose={close}
      footer={
        <>
          <Button onClick={close}>{result ? 'Done' : 'Cancel'}</Button>
          {!result && (
            <Button variant="primary" onClick={run} disabled={!file} busy={importCsv.isPending}>
              Import
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          One question per row. Required columns: <code>text</code>, <code>type</code>, <code>marks</code>. Options go
          in <code>option1</code>…<code>option10</code>; <code>correct</code> lists option numbers (e.g. <code>2</code>{' '}
          or <code>1;3</code>). Coding questions are created in the editor, not by import.{' '}
          <a className="text-accent-foreground underline" href={templateHref} download="question-import-template.csv">
            Download a template
          </a>
        </p>
        {!result && (
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}
        {error && <Alert>{error}</Alert>}
        {result && (
          <div className="space-y-2">
            <Alert tone={result.createdCount > 0 ? 'green' : 'amber'}>
              Created {result.createdCount} question{result.createdCount === 1 ? '' : 's'}
              {result.errors.length > 0 && `; ${result.errors.length} row${result.errors.length === 1 ? '' : 's'} skipped`}.
            </Alert>
            {result.errors.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
                {result.errors.map((e) => (
                  <li key={e.row} className="rounded bg-brick-light px-2 py-1 text-destructive">
                    Line {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
