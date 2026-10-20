// Owner: Person A — student register (restyled port of the Phase 1 screen).

import { bulkImportStudents, createStudent, listStudents, updateStudent, type BulkImportResponse } from '@secure-exam/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Upload, UserPlus, Users } from 'lucide-react';
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/errors';
import { parseStudentsCsv } from './parseStudentsCsv';

type StatusFilter = 'all' | 'active' | 'inactive';

export default function StudentsPage() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['students'], queryFn: listStudents });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['students'] });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((s) => status === 'all' || (status === 'active') === s.user.isActive)
      .filter(
        (s) =>
          !q ||
          s.collegeId.toLowerCase().includes(q) ||
          s.user.fullName.toLowerCase().includes(q) ||
          s.user.email.toLowerCase().includes(q),
      )
      .sort((a, b) => a.collegeId.localeCompare(b.collegeId));
  }, [data, search, status]);

  async function toggleActive(id: string, isActive: boolean) {
    setTogglingId(id);
    try {
      await updateStudent(id, { isActive: !isActive });
      toast.success(isActive ? 'Student deactivated' : 'Student reactivated');
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Students"
        description="Deactivated students can't sign in."
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload /> Import CSV
            </Button>
            <Button onClick={() => setAdding(true)}>
              <UserPlus /> Add student
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={4} />
      ) : data.length === 0 ? (
        <EmptyState icon={Users} title="No students yet" description="Add students one by one or import a CSV." />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-8" placeholder="Search name, email or college ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="w-40" aria-label="Filter by status">
              <option value="all">All ({data.length})</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>College ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.collegeId}</TableCell>
                  <TableCell>{s.user.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{s.user.email}</TableCell>
                  <TableCell>
                    {s.user.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" loading={togglingId === s.id} onClick={() => toggleActive(s.id, s.user.isActive)}>
                      {s.user.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No students match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AddStudentDialog open={adding} onOpenChange={setAdding} onCreated={refresh} />
      <ImportStudentsDialog open={importing} onOpenChange={setImporting} onImported={refresh} />
    </>
  );
}

function AddStudentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [form, setForm] = useState({ collegeId: '', fullName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createStudent({
        collegeId: form.collegeId.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
      });
      toast.success(`${form.fullName.trim()} added`);
      setForm({ collegeId: '', fullName: '', email: '', password: '' });
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add student</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="College ID">
              <Input value={form.collegeId} onChange={set('collegeId')} required autoFocus />
            </Field>
            <Field label="Full name">
              <Input value={form.fullName} onChange={set('fullName')} required />
            </Field>
          </div>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="Password (optional)" hint="At least 8 characters. Leave empty to generate one.">
            <Input type="text" value={form.password} onChange={set('password')} minLength={8} autoComplete="new-password" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!form.collegeId.trim() || !form.fullName.trim() || !form.email.trim()}>
              Add student
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportStudentsDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (o: boolean) => void; onImported: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResponse | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  async function handleImport() {
    setError(null);
    setResult(null);
    let rows;
    try {
      rows = parseStudentsCsv(text);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setSaving(true);
    try {
      const response = await bulkImportStudents(rows);
      setResult(response);
      if (response.createdCount) toast.success(`Imported ${response.createdCount} student(s)`);
      onImported();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setText('');
          setResult(null);
          setError(null);
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import students</DialogTitle>
          <DialogDescription>
            CSV with a header row: <code className="font-mono">collegeId,fullName,email</code> and optionally{' '}
            <code className="font-mono">password</code>. Existing college IDs and emails are skipped.
          </DialogDescription>
        </DialogHeader>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} className="text-sm" aria-label="CSV file" />
        <Textarea
          rows={8}
          className="font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'collegeId,fullName,email\nCS2024010,Ada Lovelace,ada@college.edu'}
          aria-label="CSV contents"
        />
        {error && <Alert variant="destructive">{error}</Alert>}
        {result && (
          <Alert variant={result.skipped.length ? 'warning' : 'success'} title={`${result.createdCount} created, ${result.skipped.length} skipped`}>
            {result.skipped.length > 0 && (
              <ul className="max-h-32 list-disc overflow-y-auto pl-4 text-xs">
                {result.skipped.map((s) => (
                  <li key={s.collegeId}>
                    {s.collegeId}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleImport} loading={saving} disabled={!text.trim()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
