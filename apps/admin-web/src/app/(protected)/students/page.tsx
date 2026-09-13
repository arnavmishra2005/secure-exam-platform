// Owner: Person A (Identity/Auth/Security)

'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  bulkImportStudents,
  createStudent,
  listStudents,
  type CreateStudentPayload,
  type StudentWithUser,
} from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentWithUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  async function refresh() {
    try {
      const data = await listStudents();
      setStudents(data);
    } catch {
      setError('Could not load the student register.');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="max-w-4xl">
      <header className="flex items-end justify-between border-b border-hairline pb-4">
        <div>
          <p className="font-sans text-xs tracking-wide text-ash-muted">
            {students ? `${students.length} entries` : '—'}
          </p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Students</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setIsImportOpen(true)}>
            Bulk import
          </Button>
          <Button onClick={() => setIsAddOpen(true)}>Add student</Button>
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-4 rounded border border-brick/30 bg-brick-light px-3 py-2 text-sm text-brick">
          {error}
        </p>
      )}

      <StudentTable students={students} />

      {isAddOpen && (
        <AddStudentDialog
          onClose={() => setIsAddOpen(false)}
          onCreated={() => {
            setIsAddOpen(false);
            refresh();
          }}
        />
      )}

      {isImportOpen && (
        <BulkImportDialog
          onClose={() => setIsImportOpen(false)}
          onImported={() => {
            setIsImportOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function StudentTable({ students }: { students: StudentWithUser[] | null }) {
  if (students === null) {
    return <p className="mt-6 text-sm text-ash-muted">Loading the register…</p>;
  }

  if (students.length === 0) {
    return (
      <div className="mt-6 rounded border border-dashed border-hairline px-6 py-10 text-center">
        <p className="font-serif text-lg text-ink">No students entered yet</p>
        <p className="mt-1 text-sm text-ash-muted">
          Add one student at a time, or bulk import a whole cohort by college ID.
        </p>
      </div>
    );
  }

  return (
    <table className="mt-6 w-full text-left text-sm">
      <thead>
        <tr className="border-b border-hairline text-xs uppercase tracking-wide text-ash-muted">
          <th className="py-2 font-medium">College ID</th>
          <th className="py-2 font-medium">Name</th>
          <th className="py-2 font-medium">Email</th>
          <th className="py-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {students.map((student) => (
          <tr key={student.id} className="border-b border-hairline/60">
            <td className="py-3 tabular-nums text-ink">{student.collegeId}</td>
            <td className="py-3 text-ink">{student.user.fullName}</td>
            <td className="py-3 text-ash-muted">{student.user.email}</td>
            <td className="py-3">
              <Badge tone={student.user.isActive ? 'verdigris' : 'neutral'}>
                {student.user.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded border border-hairline bg-paper-raised p-6 shadow-none">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl text-ink">{title}</h2>
          <button onClick={onClose} className="text-sm text-ash-muted hover:text-ink" aria-label="Close">
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function AddStudentDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CreateStudentPayload>({ collegeId: '', fullName: '', email: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createStudent(form);
      onCreated();
    } catch {
      setError('Could not add this student — check the college ID and email are unique.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog title="Add student" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="College ID"
          required
          value={form.collegeId}
          onChange={(e) => setForm({ ...form, collegeId: e.target.value })}
        />
        <Field
          label="Full name"
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <Field
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        {error && <p className="text-sm text-brick">{error}</p>}
        <Button type="submit" isLoading={isSubmitting}>
          Add to register
        </Button>
      </form>
    </Dialog>
  );
}

function BulkImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<CreateStudentPayload[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ createdCount: number; skippedCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const parsed = parseStudentsCsv(text);
        setRows(parsed);
      } catch {
        setError('Could not read that file — expected columns: collegeId,fullName,email');
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await bulkImportStudents(rows);
      setResult({ createdCount: response.createdCount, skippedCount: response.skipped.length });
    } catch {
      setError('The import failed before reaching the server. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog title="Bulk import students" onClose={onClose}>
      {!result ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ash-muted">
            Upload a CSV with columns <code className="text-ink">collegeId,fullName,email</code>.
          </p>
          <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
          {fileName && rows.length > 0 && (
            <p className="text-sm text-ink">{fileName} — {rows.length} rows ready to import.</p>
          )}
          {error && <p className="text-sm text-brick">{error}</p>}
          <Button onClick={handleImport} isLoading={isSubmitting} disabled={rows.length === 0}>
            Import {rows.length > 0 ? `${rows.length} students` : ''}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink">
            <strong className="tabular-nums">{result.createdCount}</strong> added,{' '}
            <strong className="tabular-nums">{result.skippedCount}</strong> skipped.
          </p>
          <Button onClick={onImported}>Done</Button>
        </div>
      )}
    </Dialog>
  );
}

function parseStudentsCsv(text: string): CreateStudentPayload[] {
  const lines = text.trim().split(/\r?\n/);
  const [header, ...dataLines] = lines;
  const columns = header.split(',').map((c) => c.trim());

  const collegeIdIdx = columns.indexOf('collegeId');
  const fullNameIdx = columns.indexOf('fullName');
  const emailIdx = columns.indexOf('email');

  if (collegeIdIdx === -1 || fullNameIdx === -1 || emailIdx === -1) {
    throw new Error('Missing required columns');
  }

  return dataLines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.split(',').map((c) => c.trim());
      return {
        collegeId: cells[collegeIdIdx],
        fullName: cells[fullNameIdx],
        email: cells[emailIdx],
      };
    });
}
