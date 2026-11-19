// Owner: Person A
// Pick students from the college's student list (searched on the server by
// email, college ID or name) or paste college IDs. Shared by course enrolment
// and manual exam registration. Staff can't create students: every student
// account comes from the college's list.

import { searchStudentDirectory } from '@secure-exam/api-client';
import type { StudentLookupResponse } from '@secure-exam/types';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { getErrorMessage } from '@/lib/errors';

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 300;

interface StudentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  /** students.id values already in the target, shown as already added. */
  excludeIds: Set<string>;
  /** Receives students.id values and/or pasted college IDs. */
  onConfirm: (identifiers: string[]) => Promise<void>;
}

export function StudentPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  excludeIds,
  onConfirm,
}: StudentPickerDialogProps) {
  const [selected, setSelected] = useState<Map<string, StudentLookupResponse>>(new Map());
  const [pasted, setPasted] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const directory = useInfiniteQuery({
    queryKey: ['students', 'directory', debounced],
    queryFn: ({ pageParam }) => searchStudentDirectory({ search: debounced, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setSelected(new Map());
      setPasted('');
      setSearch('');
      setDebounced('');
      setError(null);
    }
  }, [open]);

  const students = useMemo(() => directory.data?.pages.flatMap((p) => p.items) ?? [], [directory.data]);
  const total = directory.data?.pages[0]?.total ?? 0;
  const selectable = students.filter((s) => !excludeIds.has(s.id) && !selected.has(s.id));

  const pastedIds = pasted
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const count = new Set([...selected.keys(), ...pastedIds]).size;

  function toggle(student: StudentLookupResponse) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(student.id)) next.delete(student.id);
      else next.set(student.id, student);
      return next;
    });
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm([...new Set([...selected.keys(), ...pastedIds])]);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ? `${description} ` : ''}
            Every student of the college is listed here. Search by email or college ID and tick the students to add.
          </DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div className="min-w-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="pl-8"
                placeholder="Search by email, college ID or name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search students"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {directory.isPending
                ? 'Searching…'
                : `${total} student${total === 1 ? '' : 's'}${debounced ? ` matching "${debounced}"` : ' in the college'}`}
              {selected.size > 0 && ` · ${selected.size} selected`}
            </p>
            <div className="h-72 overflow-y-auto rounded-md border bg-background">
              {directory.error ? (
                <p className="p-4 text-sm text-destructive">{getErrorMessage(directory.error)}</p>
              ) : directory.isPending ? (
                <div className="p-4">
                  <Spinner label="Loading students" />
                </div>
              ) : students.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {debounced ? 'No student matches that email or college ID.' : 'The college student list is empty.'}
                </p>
              ) : (
                <ul className="divide-y">
                  {students.map((s) => {
                    const already = excludeIds.has(s.id);
                    return (
                      <li key={s.id}>
                        <label
                          className={
                            already
                              ? 'flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground'
                              : 'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50'
                          }
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[hsl(var(--primary))]"
                            checked={already || selected.has(s.id)}
                            disabled={already}
                            onChange={() => toggle(s)}
                            aria-label={`${s.fullName} (${s.collegeId})`}
                          />
                          <span className="w-24 shrink-0 font-mono text-xs">{s.collegeId}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{s.fullName}</span>
                            <span className="block truncate text-xs text-muted-foreground">{s.email}</span>
                          </span>
                          {already && <Badge variant="secondary">Already added</Badge>}
                          {!already && !s.isActive && <span className="text-xs text-muted-foreground">(inactive)</span>}
                        </label>
                      </li>
                    );
                  })}
                  {directory.hasNextPage && (
                    <li className="p-2 text-center">
                      <Button type="button" variant="ghost" size="sm" loading={directory.isFetchingNextPage} onClick={() => void directory.fetchNextPage()}>
                        Show more ({total - students.length} more)
                      </Button>
                    </li>
                  )}
                </ul>
              )}
            </div>
            {selectable.length > 0 && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Map(prev);
                    for (const s of selectable) next.set(s.id, s);
                    return next;
                  })
                }
              >
                Select all {selectable.length} shown
              </Button>
            )}
          </div>
          <Field label="Or paste college IDs" hint="Separated by commas, spaces or new lines.">
            <Textarea rows={11} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'CS2024001\nCS2024002'} className="font-mono text-xs" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={saving} disabled={count === 0}>
            {confirmLabel} {count > 0 && `(${count})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
