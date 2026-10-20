// Owner: Person A
// Pick students from the register (search + checkboxes) or paste college IDs.
// Shared by course enrolment and manual exam registration.

import { listStudents } from '@secure-exam/api-client';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { getErrorMessage } from '@/lib/errors';

interface StudentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  /** students.id values already in the target, shown as unavailable. */
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pasted, setPasted] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: students, isPending } = useQuery({ queryKey: ['students'], queryFn: listStudents, enabled: open });

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setPasted('');
      setSearch('');
      setError(null);
    }
  }, [open]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students ?? [])
      .filter((s) => !excludeIds.has(s.id))
      .filter(
        (s) =>
          !q ||
          s.collegeId.toLowerCase().includes(q) ||
          (s.user?.fullName ?? '').toLowerCase().includes(q) ||
          (s.user?.email ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.collegeId.localeCompare(b.collegeId));
  }, [students, excludeIds, search]);

  const pastedIds = pasted
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const total = new Set([...selected, ...pastedIds]).size;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm([...new Set([...selected, ...pastedIds])]);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-8" placeholder="Search by name, email or college ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
            </div>
            <div className="h-72 overflow-y-auto rounded-md border bg-background">
              {isPending ? (
                <div className="p-4">
                  <Spinner label="Loading students" />
                </div>
              ) : available.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No students to add.</p>
              ) : (
                <ul className="divide-y">
                  {available.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[hsl(var(--primary))]"
                          checked={selected.has(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        <span className="w-24 shrink-0 font-mono text-xs">{s.collegeId}</span>
                        <span className="min-w-0 truncate">{s.user?.fullName}</span>
                        {s.user && !s.user.isActive && <span className="text-xs text-muted-foreground">(inactive)</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {available.length > 0 && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() => setSelected(new Set(available.map((s) => s.id)))}
              >
                Select all {available.length} shown
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
          <Button onClick={handleConfirm} loading={saving} disabled={total === 0}>
            {confirmLabel} {total > 0 && `(${total})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
