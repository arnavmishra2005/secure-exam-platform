// Owner: Person A
// A course's instructors and TAs. The course's instructors add TAs (creating
// the account when the email is new), choose what each TA may do, and remove
// them; everyone else on the staff only sees the list.

import { addCourseStaff, listCourseStaff, removeCourseStaff, updateCourseStaff } from '@secure-exam/api-client';
import {
  ALL_PERMISSIONS,
  CourseStaffRole,
  DEFAULT_TA_PERMISSIONS,
  Permission,
  PERMISSION_LABELS,
} from '@secure-exam/types';
import type { CourseStaffMember } from '@secure-exam/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/errors';
import { roleLabel } from '@/lib/format';

export function CourseStaffSection({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CourseStaffMember | null>(null);
  const [removing, setRemoving] = useState<CourseStaffMember | null>(null);
  const staff = useQuery({ queryKey: ['courses', courseId, 'staff'], queryFn: () => listCourseStaff(courseId) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
    // Someone's access changed; if it was the caller's own, their menus change too.
    void queryClient.invalidateQueries({ queryKey: ['me', 'access'] });
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold">Staff</h2>
        {canManage && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <UserPlus /> Add TA or instructor
          </Button>
        )}
      </div>

      {staff.error ? (
        <ErrorState message={getErrorMessage(staff.error)} onRetry={() => staff.refetch()} />
      ) : staff.isPending ? (
        <TableSkeleton columns={4} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>May</TableHead>
              {canManage && <TableHead className="w-28" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.data.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div>{m.fullName}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={m.role === CourseStaffRole.INSTRUCTOR ? 'default' : 'secondary'}>{roleLabel(m.role)}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {m.role === CourseStaffRole.INSTRUCTOR
                    ? 'Everything on this course'
                    : m.permissions.length === 0
                      ? 'Nothing yet'
                      : m.permissions.map((p) => PERMISSION_LABELS[p]).join(' · ')}
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    {m.role === CourseStaffRole.TA && (
                      <Button variant="ghost" size="icon" aria-label={`Permissions of ${m.fullName}`} onClick={() => setEditing(m)}>
                        <ShieldCheck />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label={`Remove ${m.fullName}`} onClick={() => setRemoving(m)}>
                      <UserMinus />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AddStaffDialog courseId={courseId} open={adding} onOpenChange={setAdding} onAdded={refresh} />
      <PermissionsDialog courseId={courseId} member={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.fullName ?? 'this person'} from the course?`}
        description={
          removing?.userId === user?.id
            ? 'You will lose access to this course and its exams.'
            : 'They lose access to this course and its exams. Their account stays.'
        }
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          try {
            await removeCourseStaff(courseId, removing.userId);
            toast.success(`${removing.fullName} removed`);
            refresh();
          } catch (err) {
            toast.error(getErrorMessage(err));
          }
        }}
      />
    </section>
  );
}

function PermissionChecklist({ value, onChange }: { value: Set<Permission>; onChange: (next: Set<Permission>) => void }) {
  const toggle = (p: Permission) => {
    const next = new Set(value);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange(next);
  };
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">This TA may</legend>
      {ALL_PERMISSIONS.map((p) => (
        <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[hsl(var(--primary))]"
            checked={value.has(p)}
            onChange={() => toggle(p)}
          />
          {PERMISSION_LABELS[p]}
        </label>
      ))}
    </fieldset>
  );
}

function AddStaffDialog({
  courseId,
  open,
  onOpenChange,
  onAdded,
}: {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const empty = { email: '', fullName: '', password: '' };
  const [form, setForm] = useState(empty);
  const [role, setRole] = useState<CourseStaffRole>(CourseStaffRole.TA);
  const [permissions, setPermissions] = useState(new Set<Permission>(DEFAULT_TA_PERMISSIONS));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setForm(empty);
    setRole(CourseStaffRole.TA);
    setPermissions(new Set(DEFAULT_TA_PERMISSIONS));
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const member = await addCourseStaff(courseId, {
        email: form.email.trim(),
        fullName: form.fullName.trim() || undefined,
        password: form.password || undefined,
        role,
        permissions: role === CourseStaffRole.TA ? [...permissions] : undefined,
      });
      toast.success(`${member.fullName} added as ${roleLabel(member.role)}`);
      onAdded();
      reset();
      onOpenChange(false);
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
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to the course staff</DialogTitle>
          <DialogDescription>
            A TA with a new email gets an account with the name and password you set here. Co-instructors must already
            have an instructor account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as CourseStaffRole)}>
                <option value={CourseStaffRole.TA}>Teaching Assistant</option>
                <option value={CourseStaffRole.INSTRUCTOR}>Co-instructor</option>
              </Select>
            </Field>
          </div>
          {role === CourseStaffRole.TA && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" hint="Only for a new account.">
                  <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </Field>
                <Field label="Password" hint="Only for a new account; at least 8 characters.">
                  <Input
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={8}
                    autoComplete="new-password"
                  />
                </Field>
              </div>
              <PermissionChecklist value={permissions} onChange={setPermissions} />
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!form.email.trim()}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({
  courseId,
  member,
  onClose,
  onSaved,
}: {
  courseId: string;
  member: CourseStaffMember | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [permissions, setPermissions] = useState(new Set<Permission>());
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the member's permissions when the dialog opens for them.
  if (member && shownFor !== member.id) {
    setShownFor(member.id);
    setPermissions(new Set(member.permissions));
    setError(null);
  }

  async function save() {
    if (!member) return;
    setSaving(true);
    setError(null);
    try {
      await updateCourseStaff(courseId, member.userId, { permissions: [...permissions] });
      toast.success(`Permissions of ${member.fullName} saved`);
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!member}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setShownFor(null);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>What {member?.fullName ?? 'this TA'} may do</DialogTitle>
          <DialogDescription>On this course only. Their other courses are not affected.</DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive">{error}</Alert>}
        <PermissionChecklist value={permissions} onChange={setPermissions} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
